import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../core/auth.service';
import { SessionStore } from '../core/session.store';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  it('keeps login disabled until the CSRF session is ready', async () => {
    const session = new Subject<boolean>();
    const login = vi.fn(() => of(undefined));
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: { ensureSession: () => session, login } },
        { provide: Router, useValue: { navigate: vi.fn() } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentInstance.form.setValue({ username: 'Emiliano', password: 'secret' });
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fixture.componentInstance.submit();
    expect(login).not.toHaveBeenCalled();

    TestBed.inject(SessionStore).set(null, 'csrf-token');
    session.next(false);
    fixture.detectChanges();

    expect(button.disabled).toBe(false);
    fixture.componentInstance.submit();
    expect(login).toHaveBeenCalledOnce();
  });

  it('keeps login disabled when session initialization fails', async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: { ensureSession: () => of(false), login: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Impossibile inizializzare la sessione');
  });
});
