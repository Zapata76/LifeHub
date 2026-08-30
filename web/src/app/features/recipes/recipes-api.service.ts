import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { RecipeDetail, RecipePayload, RecipesOverview } from './recipes.models';

@Injectable({ providedIn: 'root' })
export class RecipesApiService {
  private readonly http = inject(HttpClient);

  overview(): Observable<RecipesOverview> {
    return this.http.get<RecipesOverview>('api/v1/recipes/overview');
  }

  detail(id: number): Observable<RecipeDetail> {
    return this.http.get<{ item: RecipeDetail }>(`api/v1/recipes/${id}`).pipe(map(({ item }) => item));
  }

  create(payload: RecipePayload): Observable<number> {
    return this.http.post<{ id: number }>('api/v1/recipes', payload).pipe(map(({ id }) => id));
  }

  update(id: number, payload: RecipePayload): Observable<void> {
    return this.http.put(`api/v1/recipes/${id}`, payload).pipe(map(() => undefined));
  }

  archive(id: number, version: number): Observable<void> {
    return this.http.post(`api/v1/recipes/${id}/archive`, { version }).pipe(map(() => undefined));
  }

  createProduct(name: string, categoryId: number | null): Observable<RecipesOverview['products'][number]> {
    return this.http.post<{ item: RecipesOverview['products'][number] }>('api/v1/products', {
      name, category_id: categoryId
    }).pipe(map(({ item }) => item));
  }

  removeImage(id: number): Observable<void> {
    return this.http.post(`api/v1/recipes/${id}/image/remove`, {}).pipe(map(() => undefined));
  }

  uploadImage(id: number, file: File): Observable<void> {
    const body = new FormData();
    body.append('ownerType', 'recipe');
    body.append('ownerId', String(id));
    body.append('file', file);
    return this.http.post('api/v1/attachments', body).pipe(map(() => undefined));
  }

  attachment(id: number): string {
    return `api/v1/attachments/${id}/download?inline=1`;
  }
}
