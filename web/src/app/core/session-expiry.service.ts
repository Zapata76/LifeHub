import { HttpBackend, HttpClient } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, fromEvent, map, merge, of, shareReplay, tap, throttleTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { SessionStore, SessionUser } from './session.store';
import { AuthService } from './auth.service';

export const SESSION_EXPIRED_REASON = 'session-expired';

@Injectable({ providedIn: 'root' })
export class SessionExpiryService {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private verification?: Observable<boolean | null>;
  private started = false;
  private redirectPending = false;

  handle(): void {
    this.auth.invalidateSession();

    if (this.redirectPending || this.isLoginPage()) {
      return;
    }

    this.redirectPending = true;
    void this.router.navigate(['/login'], {
      queryParams: { reason: SESSION_EXPIRED_REASON },
      replaceUrl: true
    }).catch(() => {
      const url = new URL('login?reason=' + SESSION_EXPIRED_REASON, this.document.baseURI);
      this.document.defaultView?.location.replace(url.href);
    }).finally(() => {
      this.redirectPending = false;
    });
  }

  // A failed network request does not prove that the session has expired.
  verify(): Observable<boolean | null> {
    if (this.verification) return this.verification;
    this.verification = this.http.get<{
      authenticated: boolean; user: SessionUser | null; csrfToken: string;
    }>('api/v1/auth/session').pipe(
      tap((response) => {
        if (!response.authenticated) this.handle();
        else this.session.set(response.user, response.csrfToken);
      }),
      map((response) => response.authenticated),
      catchError(() => of(null)),
      finalize(() => { this.verification = undefined; }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.verification;
  }

  start(): void {
    const window = this.document.defaultView;
    if (this.started || !window) return;
    this.started = true;
    merge(fromEvent(window, 'focus'), fromEvent(window, 'online'), fromEvent(this.document, 'visibilitychange'))
      .pipe(throttleTime(1000), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        if (this.document.visibilityState === 'visible' && window.navigator.onLine && this.session.authenticated()) {
          this.verify().subscribe();
        }
      });
  }

  private isLoginPage(): boolean {
    return /^\/login(?:[/?#]|$)/.test(this.router.url);
  }
}
