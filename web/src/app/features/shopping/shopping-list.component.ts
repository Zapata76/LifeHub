/**
 * Presents the mobile-first shopping checklist with modal add/edit operations.
 * Check-off and removal remain direct intents; persistence stays in the typed API service.
 */

import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { apiErrorMessage } from '../../shared/api-error';
import { ModalBackdropDirective } from '../../shared/modal-backdrop.directive';
import { matchingProducts } from './product-search';
import { ShoppingApiService } from './shopping-api.service';
import { Product, ShoppingItem } from './shopping.models';
import { ShoppingStore } from './shopping.store';

@Component({
  selector: 'lh-shopping-list',
  standalone: true,
  imports: [ReactiveFormsModule, ModalBackdropDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shopping-list.component.html',
})
export class ShoppingListComponent {
  readonly api = inject(ShoppingApiService);
  readonly shopping = inject(ShoppingStore);
  readonly overview = this.shopping.listOverview;
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly marketFilter = signal('');
  readonly search = signal('');
  readonly productResultsOpen = signal(false);
  readonly highlightedProductIndex = signal(-1);
  readonly addModalOpen = signal(false);
  readonly clearModalOpen = signal(false);
  readonly editingItem = signal<ShoppingItem | null>(null);
  readonly addForm = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    productId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    supermarketId: new FormControl('', { nonNullable: true }),
    quantity: new FormControl('1', { nonNullable: true, validators: [Validators.required] })
  });
  readonly editForm = new FormGroup({
    supermarketId: new FormControl('', { nonNullable: true }),
    quantity: new FormControl('1', { nonNullable: true, validators: [Validators.required] })
  });
  readonly availableProducts = computed(() => {
    return matchingProducts(this.overview()?.products ?? [], this.search());
  });
  readonly filteredItems = computed(() => {
    const market = Number(this.marketFilter());
    return (this.overview()?.items ?? []).filter((item) => !market
      || item.supermarket_id === null || Number(item.supermarket_id) === market);
  });
  readonly checkedCount = computed(() => (this.overview()?.items ?? []).filter((item) => !!item.checked).length);

  constructor() { this.load(false); }

  load(force = true): void {
    this.loading.set(true);
    this.shopping.loadList(force).subscribe({
      next: () => { this.loading.set(false); this.busy.set(false); },
      error: () => { this.error.set('Impossibile caricare la lista della spesa.'); this.loading.set(false); this.busy.set(false); }
    });
  }

  openAdd(): void {
    this.search.set('');
    this.productResultsOpen.set(false);
    this.highlightedProductIndex.set(-1);
    this.addForm.reset({ search: '', productId: '', supermarketId: '', quantity: '1' });
    this.addModalOpen.set(true);
  }

  closeAdd(): void {
    if (!this.busy()) {
      this.productResultsOpen.set(false);
      this.addModalOpen.set(false);
    }
  }

  searchProducts(value: string): void {
    this.search.set(value);
    this.addForm.controls.productId.setValue('');
    this.productResultsOpen.set(value.trim().length > 0);
    this.highlightedProductIndex.set(-1);
  }

  openProductResults(): void {
    this.productResultsOpen.set(this.search().trim().length > 0);
  }

  closeProductResults(event: FocusEvent): void {
    const container = event.currentTarget as HTMLElement | null;
    const next = event.relatedTarget as Node | null;
    if (container && next && container.contains(next)) return;
    this.productResultsOpen.set(false);
    this.highlightedProductIndex.set(-1);
  }

  selectProduct(product: Product): void {
    this.search.set(product.name);
    this.addForm.patchValue({ search: product.name, productId: String(product.id) });
    this.productResultsOpen.set(false);
    this.highlightedProductIndex.set(-1);
  }

  handleProductSearchKeydown(event: KeyboardEvent): void {
    const results = this.availableProducts();
    if (event.key === 'Escape') {
      this.productResultsOpen.set(false);
      this.highlightedProductIndex.set(-1);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Enter') {
      const selected = results[this.highlightedProductIndex()];
      if (selected) this.selectProduct(selected);
      return;
    }
    this.productResultsOpen.set(true);
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const current = this.highlightedProductIndex();
    this.highlightedProductIndex.set(Math.max(0, Math.min(results.length - 1, current + offset)));
  }

  add(): void {
    const data = this.overview();
    if (this.addForm.invalid || !data) return;
    const value = this.addForm.getRawValue();
    const list = data.lists.find((candidate) => Number(candidate.is_primary) === 1) ?? data.lists[0];
    if (!list) { this.error.set('Nessuna lista della spesa attiva.'); return; }
    this.busy.set(true); this.error.set('');
    this.api.addItem({
      listId: list.id, productId: Number(value.productId),
      supermarketId: value.supermarketId ? Number(value.supermarketId) : null,
      quantity: value.quantity.trim()
    }).subscribe({
      next: () => { this.addModalOpen.set(false); this.shopping.invalidateCatalog(); this.load(); },
      error: (response: HttpErrorResponse) => {
        if (response.status === 409 && response.error?.error?.code === 'shopping.duplicate') {
          this.error.set(response.error.error.message || 'Il prodotto è già presente nella lista.');
          this.addModalOpen.set(false);
          this.productResultsOpen.set(false);
          this.load();
          return;
        }
        this.error.set(apiErrorMessage(response, 'Il prodotto non è stato aggiunto.')); this.busy.set(false);
      }
    });
  }

  openEdit(item: ShoppingItem): void {
    this.editingItem.set(item);
    this.editForm.setValue({
      supermarketId: item.supermarket_id ? String(item.supermarket_id) : '',
      quantity: item.quantity_raw || '1'
    });
  }

  closeEdit(): void { if (!this.busy()) this.editingItem.set(null); }

  saveEdit(): void {
    const item = this.editingItem();
    if (!item || this.editForm.invalid) return;
    const value = this.editForm.getRawValue();
    this.busy.set(true); this.error.set('');
    this.api.updateItem(item.id, {
      checked: Boolean(item.checked), quantity: value.quantity.trim(),
      supermarketId: value.supermarketId ? Number(value.supermarketId) : null, version: item.version
    }).subscribe({
      next: () => { this.editingItem.set(null); this.shopping.invalidateCatalog(); this.load(); },
      error: () => this.conflict()
    });
  }

  toggle(item: ShoppingItem): void {
    const checked = !Boolean(item.checked);
    this.optimistic(item, checked);
    this.api.updateItem(item.id, {
      checked, quantity: item.quantity_raw || '1', supermarketId: item.supermarket_id, version: item.version
    }).subscribe({
      next: () => { this.shopping.invalidateCatalog(); this.load(); },
      error: () => { this.optimistic(item, !checked); this.conflict(); }
    });
  }

  remove(item: ShoppingItem): void {
    this.busy.set(true);
    this.api.removeItem(item.id, item.version).subscribe({
      next: () => { this.shopping.invalidateCatalog(); this.load(); },
      error: () => this.conflict()
    });
  }

  openClear(): void {
    if (this.checkedCount() > 0) this.clearModalOpen.set(true);
  }

  closeClear(): void { if (!this.busy()) this.clearModalOpen.set(false); }

  clearChecked(): void {
    const data = this.overview();
    const list = data?.lists.find((candidate) => Number(candidate.is_primary) === 1) ?? data?.lists[0];
    if (!list) { this.error.set('Nessuna lista della spesa attiva.'); return; }
    this.busy.set(true); this.error.set('');
    this.api.clearChecked(list.id).subscribe({
      next: () => { this.clearModalOpen.set(false); this.shopping.invalidateCatalog(); this.load(); },
      error: (response: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(response, 'Non è stato possibile pulire gli articoli acquistati.'));
        this.busy.set(false);
      }
    });
  }

  hasImage(item: ShoppingItem): boolean {
    return item.image_attachment_id !== null;
  }

  itemName(item: ShoppingItem): string { return item.product_name || item.label; }
  value(event: Event): string { return (event.target as HTMLInputElement | HTMLSelectElement).value; }

  private optimistic(item: ShoppingItem, checked: boolean): void {
    this.overview.update((data) => data ? {
      ...data, items: data.items.map((candidate) => candidate.id === item.id
        ? { ...candidate, checked: checked ? 1 : 0 } : candidate)
    } : data);
  }

  private conflict(): void {
    this.editingItem.set(null);
    this.error.set('La lista è cambiata: ho ricaricato i dati aggiornati.');
    this.load();
  }

}
