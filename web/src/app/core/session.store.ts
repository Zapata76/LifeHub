import { Injectable, computed, signal } from '@angular/core';

export interface SessionUser {
  id: number;
  householdId: number;
  role: 'admin' | 'adult' | 'child';
  username: string;
}

@Injectable({ providedIn: 'root' })
export class SessionStore {
  readonly user = signal<SessionUser | null>(null);
  readonly csrfToken = signal('');
  readonly authenticated = computed(() => this.user() !== null);

  set(user: SessionUser | null, csrfToken: string): void {
    this.user.set(user);
    this.csrfToken.set(csrfToken);
  }

  clear(): void {
    this.user.set(null);
    this.csrfToken.set('');
  }
}
