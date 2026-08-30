import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionStore } from './session.store';

export const SESSION_EXPIRED_REASON = 'session-expired';

@Injectable({ providedIn: 'root' })
export class SessionExpiryService {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private redirectPending = false;

  handle(): void {
    this.session.clear();

    if (this.redirectPending || this.isLoginPage()) {
      return;
    }

    this.redirectPending = true;
    void this.router.navigate(['/login'], {
      queryParams: { reason: SESSION_EXPIRED_REASON },
      replaceUrl: true
    }).finally(() => {
      this.redirectPending = false;
    });
  }

  private isLoginPage(): boolean {
    return /^\/login(?:[/?#]|$)/.test(this.router.url);
  }
}
