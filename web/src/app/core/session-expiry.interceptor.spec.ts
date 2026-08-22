import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from './session.store';
import { sessionExpiryInterceptor } from './session-expiry.interceptor';

describe('sessionExpiryInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let session: SessionStore;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigate = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([sessionExpiryInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } }
      ]
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    http.verify();
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
      expect(navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
    }
  );

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
});
