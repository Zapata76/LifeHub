import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { InventoryItem, InventoryOverview, InventoryPayload } from './inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryApiService {
  private readonly http = inject(HttpClient);

  overview(): Observable<InventoryOverview> {
    return this.http.get<InventoryOverview>('api/v1/inventory/overview');
  }

  detail(id: number): Observable<InventoryItem> {
    return this.http.get<{ item: InventoryItem }>(`api/v1/inventory/${id}`).pipe(map(({ item }) => item));
  }

  create(payload: InventoryPayload): Observable<number> {
    return this.http.post<{ id: number }>('api/v1/inventory', payload).pipe(map(({ id }) => id));
  }

  update(id: number, payload: InventoryPayload): Observable<void> {
    return this.http.put(`api/v1/inventory/${id}`, payload).pipe(map(() => undefined));
  }

  archive(id: number, version: number): Observable<void> {
    return this.http.post(`api/v1/inventory/${id}/archive`, { version }).pipe(map(() => undefined));
  }

  removeImage(id: number): Observable<void> {
    return this.http.post(`api/v1/inventory/${id}/image/remove`, {}).pipe(map(() => undefined));
  }

  uploadImage(id: number, file: File): Observable<void> {
    const body = new FormData();
    body.append('ownerType', 'inventory');
    body.append('ownerId', String(id));
    body.append('file', file);
    return this.http.post('api/v1/attachments', body).pipe(map(() => undefined));
  }

  attachment(id: number): string {
    return `api/v1/attachments/${id}/download?inline=1`;
  }
}
