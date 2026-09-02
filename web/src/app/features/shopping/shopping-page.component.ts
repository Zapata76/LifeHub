/** Presents the dedicated shopping workspace and its five task-focused views. */

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ShoppingCatalogComponent } from './shopping-catalog.component';
import { ShoppingListComponent } from './shopping-list.component';
import { ShoppingPricesComponent } from './shopping-prices.component';
import { ShoppingStore } from './shopping.store';

type ShoppingView = 'list' | 'products' | 'prices' | 'categories' | 'supermarkets';

@Component({
  standalone: true,
  imports: [ShoppingListComponent, ShoppingPricesComponent, ShoppingCatalogComponent],
  providers: [ShoppingStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading shopping-heading">
      <div><p class="eyebrow">Organizzazione</p><h1>Lista della spesa</h1></div>
      <p class="muted shopping-mobile-optional-copy">Lista condivisa, prezzi e prodotti in un unico spazio.</p>
    </div>
    <nav class="shopping-tabs" aria-label="Sezioni della spesa">
      <button type="button" [class.active]="view() === 'list'" (click)="view.set('list')">Lista</button>
      <button type="button" [class.active]="view() === 'products'" (click)="view.set('products')">Prodotti</button>
      <button type="button" [class.active]="view() === 'prices'" (click)="view.set('prices')">Prezzi</button>
      <button type="button" [class.active]="view() === 'categories'" (click)="view.set('categories')">Categorie</button>
      <button type="button" [class.active]="view() === 'supermarkets'" (click)="view.set('supermarkets')">Supermercati</button>
    </nav>
    @switch (view()) {
      @case ('products') { <lh-shopping-catalog section="products" /> }
      @case ('prices') { <lh-shopping-prices /> }
      @case ('categories') { <lh-shopping-catalog section="categories" /> }
      @case ('supermarkets') { <lh-shopping-catalog section="supermarkets" /> }
      @default { <lh-shopping-list /> }
    }
  `
})
export class ShoppingPageComponent {
  readonly view = signal<ShoppingView>('list');
}
