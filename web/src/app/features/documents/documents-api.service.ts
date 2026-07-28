import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { DocumentItem, DocumentOverview, DocumentPayload } from './documents.models';

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  private readonly http = inject(HttpClient);

  overview(): Observable<DocumentOverview> {
    return this.http.get<DocumentOverview>('api/v1/documents/overview');
  }

  detail(id: number): Observable<DocumentItem> {
    return this.http.get<{ item: DocumentItem }>(`api/v1/documents/${id}`).pipe(map(({ item }) => item));
  }

  create(payload: DocumentPayload, file: File): Observable<number> {
    return this.http.post<{ id: number }>('api/v1/documents', this.body(payload, file))
      .pipe(map(({ id }) => Number(id)));
  }

  update(id: number, payload: DocumentPayload, file: File | null): Observable<void> {
    return this.http.post(`api/v1/documents/${id}`, this.body(payload, file)).pipe(map(() => undefined));
  }

  delete(id: number, version: number): Observable<void> {
    return this.http.delete(`api/v1/documents/${id}`, { body: { version } }).pipe(map(() => undefined));
  }

  attachment(id: number, inline = false): string {
    return `api/v1/attachments/${id}/download${inline ? '?inline=1' : ''}`;
  }

  private body(payload: DocumentPayload, file: File | null): FormData {
    const body = new FormData();
    body.append('title', payload.title);
    body.append('category', payload.category);
    body.append('notes', payload.notes);
    if (payload.version !== undefined) body.append('version', String(payload.version));
    if (file) body.append('file', file, file.name);
    return body;
  }
}
