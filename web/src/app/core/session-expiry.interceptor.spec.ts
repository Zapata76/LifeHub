import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from './session.store';
import { sessionExpiryInterceptor } from './session-expiry.interceptor';
import { AuthService } from './auth.service';
import { SessionExpiryService } from './session-expiry.service';
import { requestActivityInterceptor } from './request-activity.interceptor';
import { AppUpdateService } from './app-update.service';

describe('sessionExpiryInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let session: SessionStore;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigate = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([requestActivityInterceptor, sessionExpiryInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { url: '/shopping', navigate } }
      ]
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    http.verify();
    expect(TestBed.inject(AppUpdateService).requests()).toBe(0);
    vi.restoreAllMocks();
  });

  it.each(['auth.required', 'auth.revoked'])(
    'clears the local session and redirects on %s',
    (code) => {
      session.set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf-token');

      client.get('/api/v1/tasks').subscribe({ error: () => undefined });
      http.expectOne('/api/v1/tasks').flush(
        { error: { code, message: 'Authentication is required.' } },
        { status: 401, statusText: 'Unauthorized' }
      );

      expect(session.authenticated()).toBe(false);
      expect(session.csrfToken()).toBe('');
      expect(navigate).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { reason: 'session-expired' },
        replaceUrl: true
      });
    }
  );

  it('checks a csrf rejection and suppresses generic errors when the session has expired', () => {
    const failure = vi.fn();
    session.set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'old');
    client.put('/api/v1/tasks/1', {}).subscribe({ error: failure });
    http.expectOne('/api/v1/tasks/1').flush({ error: { code: 'csrf.invalid' } }, { status: 403, statusText: 'Forbidden' });
    http.expectOne('api/v1/auth/session').flush({ authenticated: false, user: null, csrfToken: 'new' });
    expect(navigate).toHaveBeenCalledOnce();
    expect(failure).not.toHaveBeenCalled();
  });

  it('rechecks the session when returning to the app', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    session.set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'old');
    TestBed.inject(SessionExpiryService).start();
    window.dispatchEvent(new Event('focus'));
    http.expectOne('api/v1/auth/session').flush({ authenticated: false, user: null, csrfToken: 'new' });
    expect(navigate).toHaveBeenCalledOnce();
    expect(session.authenticated()).toBe(false);
  });

  it('refreshes csrf without replaying a command or logging out an active user', () => {
    const failure = vi.fn();
    const user = { id: 1, householdId: 1, role: 'admin' as const, username: 'admin' };
    session.set(user, 'old');
    client.put('/api/v1/tasks/1', {}).subscribe({ error: failure });
    http.expectOne('/api/v1/tasks/1').flush({ error: { code: 'csrf.invalid' } }, { status: 403, statusText: 'Forbidden' });
    http.expectOne('api/v1/auth/session').flush({ authenticated: true, user, csrfToken: 'new' });
    expect(navigate).not.toHaveBeenCalled();
    expect(session.csrfToken()).toBe('new');
    expect(failure).toHaveBeenCalledOnce();
    http.expectNone('/api/v1/tasks/1');
  });

  it('does not log out on network failure or on an authorization denial', () => {
    const user = { id: 1, householdId: 1, role: 'adult' as const, username: 'user' };
    session.set(user, 'old');
    client.put('/api/v1/tasks/1', {}).subscribe({ error: () => undefined });
    http.expectOne('/api/v1/tasks/1').flush({ error: { code: 'csrf.invalid' } }, { status: 403, statusText: 'Forbidden' });
    http.expectOne('api/v1/auth/session').error(new ProgressEvent('error'));
    client.get('/api/v1/users').subscribe({ error: () => undefined });
    http.expectOne('/api/v1/users').flush({ error: { code: 'authorization.denied' } }, { status: 403, statusText: 'Forbidden' });
    expect(session.authenticated()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('invalidates the cached authenticated result after expiry', () => {
    const auth = TestBed.inject(AuthService);
    auth.ensureSession().subscribe();
    const user = { id: 1, householdId: 1, role: 'admin', username: 'admin' };
    http.expectOne('api/v1/auth/session').flush({ authenticated: true, user, csrfToken: 'old' });
    client.get('/api/v1/tasks').subscribe();
    http.expectOne('/api/v1/tasks').flush({ error: { code: 'auth.required' } }, { status: 401, statusText: 'Unauthorized' });
    const result = vi.fn();
    auth.ensureSession().subscribe(result);
    http.expectOne('api/v1/auth/session').flush({ authenticated: false, user: null, csrfToken: 'new' });
    expect(result).toHaveBeenCalledWith(false);
  });

  it('redirects when session refresh returns an anonymous session with HTTP 200', () => {
    session.set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'old');
    client.get('api/v1/auth/session').subscribe();
    http.expectOne('api/v1/auth/session').flush({ authenticated: false, user: null, csrfToken: 'new' });
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('does not treat rejected login credentials as an expired session', () => {
    session.set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf-token');

    client.post('/api/v1/auth/login', {}).subscribe({ error: () => undefined });
    http.expectOne('/api/v1/auth/login').flush(
      { error: { code: 'auth.invalid_credentials', message: 'Invalid credentials.' } },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(session.authenticated()).toBe(true);
    expect(session.csrfToken()).toBe('csrf-token');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('redirects even when concurrent failures have already cleared the local user', () => {
    client.get('/api/v1/dashboard').subscribe({ error: () => undefined });
    http.expectOne('/api/v1/dashboard').flush(
      { error: { code: 'auth.required', message: 'Authentication is required.' } },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(session.authenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('starts only one redirect for concurrent expired-session responses', () => {
    client.get('/api/v1/dashboard').subscribe({ error: () => undefined });
    client.get('/api/v1/meals').subscribe({ error: () => undefined });

    http.expectOne('/api/v1/dashboard').flush(
      { error: { code: 'auth.required', message: 'Authentication is required.' } },
      { status: 401, statusText: 'Unauthorized' }
    );
    http.expectOne('/api/v1/meals').flush(
      { error: { code: 'auth.required', message: 'Authentication is required.' } },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(navigate).toHaveBeenCalledOnce();
  });

  it('does not redirect again while the login form is already displayed', () => {
    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'url', { value: '/login?reason=session-expired' });

    client.get('/api/v1/auth/session').subscribe({ error: () => undefined });
    http.expectOne('/api/v1/auth/session').flush(
      { error: { code: 'auth.required', message: 'Authentication is required.' } },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(navigate).not.toHaveBeenCalled();
  });
});
