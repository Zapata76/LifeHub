/** Presents the dedicated shopping workspace and its three task-focused views. */

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ShoppingCatalogComponent } from './shopping-catalog.component';
import { ShoppingListComponent } from './shopping-list.component';
import { ShoppingPricesComponent } from './shopping-prices.component';

type ShoppingView = 'list' | 'prices' | 'catalog';

@Component({
  standalone: true,
  imports: [ShoppingListComponent, ShoppingPricesComponent, ShoppingCatalogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading shopping-heading">
      <div><p class="eyebrow">Organizzazione</p><h1>Lista della spesa</h1></div>
      <p class="muted shopping-mobile-optional-copy">Lista condivisa, prezzi e prodotti in un unico spazio.</p>
    </div>
    <nav class="shopping-tabs" aria-label="Sezioni della spesa">
      <button type="button" [class.active]="view() === 'list'" (click)="view.set('list')">Lista</button>
      <button type="button" [class.active]="view() === 'prices'" (click)="view.set('prices')">Prezzi</button>
      <button type="button" [class.active]="view() === 'catalog'" (click)="view.set('catalog')">Anagrafica</button>
    </nav>
    @switch (view()) {
      @case ('prices') { <lh-shopping-prices /> }
      @case ('catalog') { <lh-shopping-catalog /> }
      @default { <lh-shopping-list /> }
    }
  `
})
export class ShoppingPageComponent {
  readonly view = signal<ShoppingView>('list');
}
