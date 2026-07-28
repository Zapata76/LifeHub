/**
 * Provides the shopping UI's typed API boundary.
 * It does not hold view state or reproduce backend authorization rules.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import { ShoppingOverview } from './shopping.models';

interface ResourceItem { id: number; version: number; }
interface AttachmentItem { id: number; version: number; }

@Injectable({ providedIn: 'root' })
export class ShoppingApiService {
  private readonly http = inject(HttpClient);

  overview(): Observable<ShoppingOverview> {
    return this.http.get<ShoppingOverview>('api/v1/shopping/overview');
  }

  addItem(command: {
    listId: number; productId: number; supermarketId: number | null; quantity: string;
  }): Observable<{ id: number }> {
    return this.http.post<{ id: number }>('api/v1/shopping/items', command);
  }

  updateItem(id: number, command: {
    checked: boolean; quantity: string; supermarketId: number | null; version: number;
  }): Observable<void> {
    return this.http.put('api/v1/shopping/items/' + id, command).pipe(map(() => undefined));
  }

  removeItem(id: number, version: number): Observable<void> {
    return this.http.post('api/v1/shopping/items/' + id + '/remove', { version }).pipe(map(() => undefined));
  }

  clearChecked(listId: number): Observable<{ removed: number }> {
    return this.http.post<{ removed: number }>('api/v1/shopping/items/clear-checked', { listId });
  }

  createProduct(name: string, categoryId: number, image?: File): Observable<void> {
    return this.createResource('products', { name, category_id: categoryId }).pipe(
      switchMap((item) => image ? this.upload('product', item.id, image) : this.done())
    );
  }

  updateProduct(id: number, version: number, name: string, categoryId: number, image?: File): Observable<void> {
    return this.updateResource('products', id, { name, category_id: categoryId, version }).pipe(
      switchMap(() => image ? this.upload('product', id, image) : this.done())
    );
  }

  createCategory(name: string): Observable<void> {
    return this.createResource('categories', { name }).pipe(map(() => undefined));
  }

  createSupermarket(name: string): Observable<void> {
    return this.createResource('supermarkets', { name }).pipe(map(() => undefined));
  }

  createPrice(command: {
    product_id: number; supermarket_id: number; amount: number; currency: string;
    package_text: string | null; observed_on: string | null;
  }, image?: File): Observable<void> {
    return this.createResource('prices', command).pipe(
      switchMap((item) => image ? this.upload('price', item.id, image) : this.done())
    );
  }

  deleteCatalog(resource: 'products' | 'prices' | 'categories' | 'supermarkets', id: number, version: number): Observable<void> {
    return this.http.delete(`api/v1/shopping/catalog/${resource}/${id}`, { body: { version } })
      .pipe(map(() => undefined));
  }

  attachment(id: number): string {
    return `api/v1/attachments/${id}/download?inline=1`;
  }

  private createResource(resource: string, values: object): Observable<ResourceItem> {
    return this.http.post<{ item: ResourceItem }>('api/v1/' + resource, values).pipe(map(({ item }) => item));
  }

  private updateResource(resource: string, id: number, values: object): Observable<void> {
    return this.http.put(`api/v1/${resource}/${id}`, values).pipe(map(() => undefined));
  }

  private upload(ownerType: string, ownerId: number, file: File): Observable<void> {
    const body = new FormData();
    body.append('ownerType', ownerType);
    body.append('ownerId', String(ownerId));
    body.append('file', file);
    return this.http.post<{ item: AttachmentItem }>('api/v1/attachments', body).pipe(map(() => undefined));
  }

  private done(): Observable<void> {
    return new Observable<void>((subscriber) => { subscriber.next(); subscriber.complete(); });
  }
}
