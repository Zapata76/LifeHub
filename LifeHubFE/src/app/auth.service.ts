import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';

export interface HubUser {
  id: number;
  username: string;
  role: 'admin' | 'adult' | 'child';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = 'api/auth.php';
  private userSubject = new BehaviorSubject<HubUser | null>(null);
  user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient) {}

  get user(): HubUser | null {
    return this.userSubject.value;
  }

  me(): Observable<HubUser> {
    return this.http.get<HubUser>(`${this.apiUrl}?action=me`, { withCredentials: true }).pipe(
      tap(user => this.userSubject.next(user))
    );
  }

  login(username: string, password: string): Observable<HubUser> {
    return this.http.post<{ user: HubUser }>(
      `${this.apiUrl}?action=login`,
      { username, password },
      { withCredentials: true }
    ).pipe(
      map(res => res.user),
      tap(user => this.userSubject.next(user))
    );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=logout`, {}, { withCredentials: true }).pipe(
      tap(() => this.userSubject.next(null))
    );
  }
}
