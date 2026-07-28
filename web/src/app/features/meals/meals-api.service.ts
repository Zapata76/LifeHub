import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { MealPayload, MealsOverview, ShoppingPreview } from './meals.models';

@Injectable({ providedIn: 'root' })
export class MealsApiService {
  private readonly http = inject(HttpClient);

  overview(start: string, end: string): Observable<MealsOverview> {
    return this.http.get<MealsOverview>('api/v1/meals/overview', {
      params: new HttpParams().set('start', start).set('end', end)
    });
  }

  create(payload: MealPayload): Observable<number> {
    return this.http.post<{ id: number }>('api/v1/meals', payload).pipe(map(({ id }) => id));
  }

  update(id: number, payload: MealPayload): Observable<void> {
    return this.http.put(`api/v1/meals/${id}`, payload).pipe(map(() => undefined));
  }

  delete(id: number, version: number): Observable<void> {
    return this.http.delete(`api/v1/meals/${id}`, { body: { version } }).pipe(map(() => undefined));
  }

  shoppingPreview(mealIds: number[]): Observable<ShoppingPreview> {
    return this.http.post<ShoppingPreview>('api/v1/meals/shopping-preview', { mealIds });
  }

  generateShopping(listId: number, mealIds: number[]): Observable<{ createdItems: number; skippedIngredients: number }> {
    const key = `meal-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    return this.http.post<{ createdItems: number; skippedIngredients: number }>(
      'api/v1/meals/generate-shopping', { listId, mealIds }, { headers: { 'Idempotency-Key': key } }
    );
  }

  attachment(id: number): string { return `api/v1/attachments/${id}/download?inline=1`; }
}
