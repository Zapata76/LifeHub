import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GoalLog {
  id?: number;
  tracker_id: number;
  log_date: string;
  value: number;
  notes?: string;
}

export interface Tracker {
  id?: number;
  goal_id: number;
  type: 'numeric' | 'boolean' | 'percentage';
  frequency: 'daily' | 'weekly';
  logs?: GoalLog[];
}

export interface Goal {
  id?: number;
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  owner_id: number;
  owner_name?: string;
  status: 'active' | 'completed' | 'suspended';
  created_at?: string;
  trackers?: Tracker[];
}

@Injectable({
  providedIn: 'root'
})
export class GoalsService {
  private apiUrl = 'api/goals.php';

  constructor(private http: HttpClient) { }

  getGoals(): Observable<Goal[]> {
    return this.http.get<Goal[]>(`${this.apiUrl}?action=get_goals`, { withCredentials: true });
  }

  saveGoal(goal: Goal): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=save_goal`, goal, { withCredentials: true });
  }

  deleteGoal(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}?action=delete_goal&id=${id}`, { withCredentials: true });
  }

  addLog(log: GoalLog): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=add_log`, log, { withCredentials: true });
  }
}
