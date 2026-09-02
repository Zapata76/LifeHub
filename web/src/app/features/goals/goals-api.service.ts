import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GoalLog, GoalPayload, GoalsOverview } from './goals.models';

@Injectable({ providedIn: 'root' })
export class GoalsApiService {
  private readonly http = inject(HttpClient);

  overview(): Observable<GoalsOverview> {
    return this.http.get<GoalsOverview>('api/v1/goals/overview');
  }

  create(payload: GoalPayload): Observable<number> {
    return this.http.post<{ id: number }>('api/v1/goals', payload).pipe(map(({ id }) => Number(id)));
  }

  update(id: number, payload: GoalPayload): Observable<void> {
    return this.http.put(`api/v1/goals/${id}`, payload).pipe(map(() => undefined));
  }

  delete(id: number, version: number): Observable<void> {
    return this.http.delete(`api/v1/goals/${id}`, { body: { version } }).pipe(map(() => undefined));
  }

  saveLog(trackerId: number, date: string, value: number | boolean, note: string): Observable<void> {
    return this.http.post(`api/v1/goal-trackers/${trackerId}/log`, { date, value, note })
      .pipe(map(() => undefined));
  }

  logs(trackerId: number): Observable<GoalLog[]> {
    return this.http.get<{ items: GoalLog[] }>(`api/v1/goal-trackers/${trackerId}/logs`)
      .pipe(map(({ items }) => items));
  }
}
