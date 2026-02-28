import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface HubManagedUser {
  id: number;
  username: string;
  role: 'admin' | 'adult' | 'child';
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private apiUrl = 'api/users.php';

  constructor(private http: HttpClient) {}

  getUsers(): Observable<HubManagedUser[]> {
    return this.http.get<HubManagedUser[]>(`${this.apiUrl}?action=get_users`, { withCredentials: true });
  }

  getRoles(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}?action=get_roles`, { withCredentials: true });
  }

  createUser(payload: { username: string; password: string; role: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=create_user`, payload, { withCredentials: true });
  }

  updateRole(payload: { id: number; role: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=update_user_role`, payload, { withCredentials: true });
  }

  updatePassword(payload: { id: number; password: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=update_user_password`, payload, { withCredentials: true });
  }

  deleteUser(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}?action=delete_user&id=${id}`, { withCredentials: true });
  }
}
