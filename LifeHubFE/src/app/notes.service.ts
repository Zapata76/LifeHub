import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Note {
  id?: number;
  title: string;
  content: string;
  color?: string;
  is_pinned?: boolean | number;
  image_url?: string;
  author?: string;
  updated_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotesService {
  private apiUrl = '/umbertini/api/notes.php';

  constructor(private http: HttpClient) { }

  getNotes(): Observable<Note[]> {
    return this.http.get<Note[]>(`${this.apiUrl}?action=get_notes`, { withCredentials: true });
  }

  saveNote(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=save_note`, formData, { withCredentials: true });
  }

  deleteNote(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}?action=delete_note&id=${id}`, { withCredentials: true });
  }
}
