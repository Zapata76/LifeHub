import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { NoteItem, NoteOverview, NotePayload } from './note.models';

@Injectable({ providedIn: 'root' })
export class NoteApiService {
  private readonly http = inject(HttpClient);

  overview(archived: boolean): Observable<NoteOverview> {
    return this.http.get<NoteOverview>(`api/v1/notes/overview?archived=${archived ? 1 : 0}`);
  }

  detail(id: number): Observable<NoteItem> {
    return this.http.get<{ item: NoteItem }>(`api/v1/notes/${id}`).pipe(map(({ item }) => item));
  }

  create(payload: NotePayload): Observable<number> {
    return this.http.post<{ id: number }>('api/v1/notes', payload).pipe(map(({ id }) => id));
  }

  update(id: number, payload: NotePayload): Observable<void> {
    return this.http.put(`api/v1/notes/${id}`, payload).pipe(map(() => undefined));
  }

  setPinned(id: number, version: number, pinned: boolean): Observable<void> {
    return this.http.post(`api/v1/notes/${id}/pin`, { version, pinned }).pipe(map(() => undefined));
  }

  setArchived(id: number, version: number, restore: boolean): Observable<void> {
    return this.http.post(`api/v1/notes/${id}/${restore ? 'restore' : 'archive'}`, { version })
      .pipe(map(() => undefined));
  }

  removeImage(id: number): Observable<void> {
    return this.http.post(`api/v1/notes/${id}/image/remove`, {}).pipe(map(() => undefined));
  }

  uploadImage(id: number, file: File): Observable<void> {
    const body = new FormData();
    body.append('ownerType', 'note');
    body.append('ownerId', String(id));
    body.append('file', file);
    return this.http.post('api/v1/attachments', body).pipe(map(() => undefined));
  }

  attachment(id: number): string {
    return `api/v1/attachments/${id}/download?inline=1`;
  }
}
