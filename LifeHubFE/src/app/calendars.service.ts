import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface HubCalendar {
  id: number;
  google_id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class CalendarsService {
  private apiUrl = 'api/calendars.php';

  constructor(private http: HttpClient) {}

  getMyCalendars(): Observable<HubCalendar[]> {
    return this.http.get<HubCalendar[]>(`${this.apiUrl}?action=get_my_calendars`, { withCredentials: true });
  }

  getAllCalendars(): Observable<HubCalendar[]> {
    return this.http.get<HubCalendar[]>(`${this.apiUrl}?action=get_all_calendars`, { withCredentials: true });
  }

  getUserAssociations(userId: number): Observable<number[]> {
    return this.http.get<number[]>(`${this.apiUrl}?action=get_user_associations&user_id=${userId}`, { withCredentials: true });
  }

  saveCalendar(calendar: Partial<HubCalendar>): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=save_calendar`, calendar, { withCredentials: true });
  }

  deleteCalendar(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}?action=delete_calendar&id=${id}`, { withCredentials: true });
  }

  updateUserAssociations(userId: number, calendarIds: number[]): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=update_user_associations`, { user_id: userId, calendar_ids: calendarIds }, { withCredentials: true });
  }
}
