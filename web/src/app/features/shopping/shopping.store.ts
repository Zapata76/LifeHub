/** Keeps the three shopping payloads alive while the user changes workspace tabs. */

import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { ShoppingApiService } from './shopping-api.service';
import {
  ShoppingCatalogOverview, ShoppingListOverview, ShoppingPricesOverview
} from './shopping.models';

@Injectable()
export class ShoppingStore {
  private readonly api = inject(ShoppingApiService);

  readonly listOverview = signal<ShoppingListOverview | null>(null);
  readonly catalogOverview = signal<ShoppingCatalogOverview | null>(null);
  readonly pricesOverview = signal<ShoppingPricesOverview | null>(null);

  loadList(force = false): Observable<ShoppingListOverview> {
    const current = this.listOverview();
    if (current && !force) return of(current);
    return this.api.listOverview().pipe(tap((overview) => this.listOverview.set(overview)));
  }

  loadCatalog(force = false): Observable<ShoppingCatalogOverview> {
    const current = this.catalogOverview();
    if (current && !force) return of(current);
    return this.api.catalogOverview().pipe(tap((overview) => this.catalogOverview.set(overview)));
  }

  loadPrices(force = false): Observable<ShoppingPricesOverview> {
    const current = this.pricesOverview();
    if (current && !force) return of(current);
    return this.api.pricesOverview().pipe(tap((overview) => this.pricesOverview.set(overview)));
  }

  invalidateList(): void { this.listOverview.set(null); }
  invalidateCatalog(): void { this.catalogOverview.set(null); }
  invalidatePrices(): void { this.pricesOverview.set(null); }

  invalidateAll(): void {
    this.invalidateList();
    this.invalidateCatalog();
    this.invalidatePrices();
  }
}
