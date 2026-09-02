import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, map, switchMap } from 'rxjs';
import { ImageOptimizer } from '../../shared/image-optimizer.service';
import { InventoryItem, InventoryOverview, InventoryPayload } from './inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryApiService {
  private readonly http = inject(HttpClient);
  private readonly images = inject(ImageOptimizer);

  overview(archived = false): Observable<InventoryOverview> {
    return this.http.get<InventoryOverview>(`api/v1/inventory/overview?archived=${archived ? 1 : 0}`);
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

  restore(id: number, version: number): Observable<void> {
    return this.http.post(`api/v1/inventory/${id}/restore`, { version }).pipe(map(() => undefined));
  }

  deleteItem(id: number, version: number): Observable<void> {
    return this.http.delete(`api/v1/inventory/${id}`, { body: { version } }).pipe(map(() => undefined));
  }

  createCategory(name: string): Observable<number> {
    return this.http.post<{ id: number }>('api/v1/inventory/categories', { name }).pipe(map(({ id }) => id));
  }

  updateCategory(id: number, version: number, name: string): Observable<void> {
    return this.http.put(`api/v1/inventory/categories/${id}`, { name, version }).pipe(map(() => undefined));
  }

  deleteCategory(id: number, version: number): Observable<number> {
    return this.http.delete<{ deleted: boolean; movedItems: number }>(`api/v1/inventory/categories/${id}`, {
      body: { version }
    }).pipe(map(({ movedItems }) => movedItems));
  }

  deleteImage(id: number, imageId: number, version: number): Observable<void> {
    return this.http.delete(`api/v1/inventory/${id}/images/${imageId}`, { body: { version } })
      .pipe(map(() => undefined));
  }

  uploadImage(id: number, file: File): Observable<void> {
    return from(this.images.optimize(file, {
      maxEdge: 1280, jpegQuality: 0.82, fallbackName: 'oggetto'
    })).pipe(switchMap((optimized) => {
      const body = new FormData();
      body.append('ownerType', 'inventory');
      body.append('ownerId', String(id));
      body.append('file', optimized);
      return this.http.post('api/v1/attachments', body).pipe(map(() => undefined));
    }));
  }

  attachment(id: number): string {
    return `api/v1/attachments/${id}/download?inline=1`;
  }
}
