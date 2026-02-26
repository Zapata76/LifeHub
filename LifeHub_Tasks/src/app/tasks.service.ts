import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Task {
  id?: number;
  title: string;
  description?: string;
  assigned_to?: number;
  assigned_user?: string;
  status: 'todo' | 'doing' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date?: string;
}

export interface FamilyMember {
  id: number;
  username: string;
  role: string;
}

@Injectable({
  providedIn: 'root'
})
export class TasksService {
  private apiUrl = '../api/tasks.php';

  constructor(private http: HttpClient) { }

  getTasks(): Observable<Task[]> {
    return this.http.get<Task[]>(`${this.apiUrl}?action=get_tasks`, { withCredentials: true });
  }

  saveTask(task: Task): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=save_task`, task, { withCredentials: true });
  }

  deleteTask(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}?action=delete_task&id=${id}`, { withCredentials: true });
  }

  getFamilyMembers(): Observable<FamilyMember[]> {
    return this.http.get<FamilyMember[]>(`${this.apiUrl}?action=get_family_members`, { withCredentials: true });
  }
}
