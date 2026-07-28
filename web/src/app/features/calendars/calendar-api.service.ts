import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CalendarCreateRequest, CalendarItem } from './calendar.models';

@Injectable({ providedIn: 'root' })
export class CalendarApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<{ items: CalendarItem[] }> {
    return this.http.get<{ items: CalendarItem[] }>('api/v1/calendars');
  }

  create(calendar: CalendarCreateRequest): Observable<{ item: CalendarItem }> {
    return this.http.post<{ item: CalendarItem }>('api/v1/calendars', calendar);
  }

  delete(calendar: CalendarItem): Observable<unknown> {
    return this.http.delete(`api/v1/calendars/${calendar.id}`, { body: { version: calendar.version } });
  }
}
