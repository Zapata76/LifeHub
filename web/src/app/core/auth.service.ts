import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { SessionStore, SessionUser } from './session.store';

interface SessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
  csrfToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(SessionStore);
  private sessionRequest?: Observable<boolean>;

  ensureSession(refresh = false): Observable<boolean> {
    if (!refresh && this.sessionRequest) {
      return this.sessionRequest;
    }
    this.sessionRequest = this.http.get<SessionResponse>('api/v1/auth/session').pipe(
      tap((session) => this.store.set(session.user, session.csrfToken)),
      map((session) => session.authenticated),
      catchError(() => {
        this.sessionRequest = undefined;
        return of(this.store.authenticated());
      }),
      shareReplay(1)
    );
    return this.sessionRequest;
  }

  login(username: string, password: string): Observable<void> {
    return this.http.post<SessionResponse>('api/v1/auth/login', { username, password }).pipe(
      tap((session) => {
        this.store.set(session.user, session.csrfToken);
        this.sessionRequest = of(true);
      }),
      map(() => undefined)
    );
  }

  logout(): Observable<void> {
    return this.http.post<{ authenticated: boolean }>('api/v1/auth/logout', {}).pipe(
      tap(() => {
        this.invalidateSession();
      }),
      map(() => undefined)
    );
  }

  invalidateSession(): void {
    this.store.clear();
    this.sessionRequest = undefined;
  }
}
