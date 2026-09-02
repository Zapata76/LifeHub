/**
 * Coordinates product, category, and supermarket maintenance for authorized users.
 * Image bytes remain behind the private attachment API.
 */

import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SessionStore } from '../../core/session.store';
import { ModalBackdropDirective } from '../../shared/modal-backdrop.directive';
import { ShoppingApiService } from './shopping-api.service';
import { Product, ProductRecipeUsage } from './shopping.models';
import { ShoppingStore } from './shopping.store';

type CatalogSection = 'products' | 'categories' | 'supermarkets';
type CatalogResource = 'products' | 'categories' | 'supermarkets';
type EditableCatalogResource = 'categories' | 'supermarkets';
interface CatalogRenameTarget {
  resource: EditableCatalogResource; id: number; version: number; label: string;
}
interface CatalogDeleteTarget { resource: CatalogResource; id: number; version: number; label: string; }

@Component({
  selector: 'lh-shopping-catalog',
  standalone: true,
  imports: [ReactiveFormsModule, ModalBackdropDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shopping-catalog.component.html',
})
export class ShoppingCatalogComponent {
  readonly api = inject(ShoppingApiService);
  readonly store = inject(SessionStore);
  readonly shopping = inject(ShoppingStore);
  @Input() section: CatalogSection = 'products';
  readonly overview = this.shopping.catalogOverview;
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly filter = signal('');
  readonly productModalOpen = signal(false);
  readonly editId = signal<number | null>(null);
  readonly image = signal<File | undefined>(undefined);
  readonly deleteTarget = signal<CatalogDeleteTarget | null>(null);
  readonly renameTarget = signal<CatalogRenameTarget | null>(null);
  readonly createTarget = signal<EditableCatalogResource | null>(null);
  readonly canCapturePhoto = this.detectCameraCapture();
  readonly addingProductId = signal<number | null>(null);
  readonly productForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    categoryId: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });
  readonly catalogCreateForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });
  readonly catalogNameForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });
  readonly categoryDeletionForm = new FormGroup({
    replacementCategoryId: new FormControl('', { nonNullable: true })
  });
  readonly products = computed(() => {
    const term = this.filter().trim().toLocaleLowerCase('it');
    return (this.overview()?.products ?? []).filter((product) => !term
      || product.name.toLocaleLowerCase('it').includes(term)
      || (product.category_name ?? '').toLocaleLowerCase('it').includes(term));
  });
  readonly categories = computed(() => {
    const term = this.filter().trim().toLocaleLowerCase('it');
    return (this.overview()?.categories ?? [])
      .filter((category) => !term || category.name.toLocaleLowerCase('it').includes(term));
  });
  readonly supermarkets = computed(() => {
    const term = this.filter().trim().toLocaleLowerCase('it');
    return (this.overview()?.supermarkets ?? [])
      .filter((market) => !term || market.name.toLocaleLowerCase('it').includes(term));
  });
  readonly canManage = computed(() => ['admin', 'adult'].includes(this.store.user()?.role ?? ''));

  constructor() { this.load('', false); }

  load(message = '', force = true): void {
    this.loading.set(true);
    this.addingProductId.set(null);
    this.shopping.loadCatalog(force).subscribe({
      next: () => {
        this.loading.set(false); this.busy.set(false);
        this.addingProductId.set(null);
        this.error.set('');
        this.success.set(message);
      },
      error: () => { this.error.set('Impossibile caricare l’anagrafica.'); this.loading.set(false); this.busy.set(false); }
    });
  }

  saveProduct(): void {
    if (this.productForm.invalid) return;
    const value = this.productForm.getRawValue();
    const current = this.overview()?.products.find((product) => product.id === this.editId());
    this.busy.set(true); this.clearMessages();
    const request = current
      ? this.api.updateProduct(current.id, current.version, value.name.trim(), Number(value.categoryId), this.image())
      : this.api.createProduct(value.name.trim(), Number(value.categoryId), this.image());
    request.subscribe({
      next: () => {
        this.productModalOpen.set(false);
        this.resetProductEditor();
        this.shopping.invalidateList();
        this.shopping.invalidatePrices();
        this.load('Prodotto salvato.');
      },
      error: () => this.failed('Il prodotto non è stato salvato.')
    });
  }

  openCreate(): void {
    this.resetProductEditor();
    this.productModalOpen.set(true);
  }

  edit(product: Product): void {
    this.editId.set(product.id);
    this.image.set(undefined);
    this.productForm.setValue({ name: product.name, categoryId: String(product.category_id ?? '') });
    this.productModalOpen.set(true);
  }

  closeProductModal(): void {
    if (this.busy()) return;
    this.productModalOpen.set(false);
    this.resetProductEditor();
  }

  isProductInList(productId: number): boolean {
    return (this.overview()?.active_product_ids ?? []).some((item) => Number(item.id) === productId);
  }

  addToList(product: Product): void {
    const data = this.overview();
    if (!data || this.busy() || this.isProductInList(product.id)) return;
    this.clearMessages();
    const list = data.lists.find((candidate) => Number(candidate.is_primary) === 1) ?? data.lists[0];
    if (!list) {
      this.error.set('Nessuna lista della spesa attiva.');
      return;
    }
    this.busy.set(true);
    this.addingProductId.set(product.id);
    this.api.addItem({
      listId: list.id,
      productId: product.id,
      supermarketId: null,
      quantity: '1'
    }).subscribe({
      next: () => { this.shopping.invalidateList(); this.load(product.name + ' aggiunto alla lista.'); },
      error: (response: HttpErrorResponse) => {
        if (response.status === 409 && response.error?.error?.code === 'shopping.duplicate') {
          this.load(product.name + ' \u00e8 gi\u00e0 presente nella lista.');
          return;
        }
        this.addingProductId.set(null);
        this.failed('Il prodotto non \u00e8 stato aggiunto alla lista.');
      }
    });
  }

  openCatalogCreate(resource: EditableCatalogResource): void {
    this.clearMessages();
    this.catalogCreateForm.reset({ name: '' });
    this.createTarget.set(resource);
  }

  closeCatalogCreate(): void {
    if (this.busy()) return;
    this.createTarget.set(null);
    this.catalogCreateForm.reset({ name: '' });
  }

  createCatalog(): void {
    const target = this.createTarget();
    if (!target) return;
    if (target === 'categories') {
      this.createCategory();
      return;
    }
    this.createMarket();
  }

  createCategory(): void {
    if (this.catalogCreateForm.invalid) return;
    this.busy.set(true); this.clearMessages();
    this.api.createCategory(this.catalogCreateForm.controls.name.value.trim()).subscribe({
      next: () => {
        this.createTarget.set(null);
        this.catalogCreateForm.reset({ name: '' });
        this.shopping.invalidateList();
        this.shopping.invalidatePrices();
        this.load('Categoria aggiunta.');
      },
      error: () => this.failed('La categoria non è stata aggiunta.')
    });
  }

  createMarket(): void {
    if (this.catalogCreateForm.invalid) return;
    this.busy.set(true); this.clearMessages();
    this.api.createSupermarket(this.catalogCreateForm.controls.name.value.trim()).subscribe({
      next: () => {
        this.createTarget.set(null);
        this.catalogCreateForm.reset({ name: '' });
        this.shopping.invalidateList();
        this.shopping.invalidatePrices();
        this.load('Supermercato aggiunto.');
      },
      error: () => this.failed('Il supermercato non è stato aggiunto.')
    });
  }

  requestRename(
    resource: EditableCatalogResource,
    item: { id: number; version: number; name: string }
  ): void {
    this.clearMessages();
    this.renameTarget.set({ resource, id: item.id, version: item.version, label: item.name });
    this.catalogNameForm.setValue({ name: item.name });
  }

  closeRename(): void {
    if (this.busy()) return;
    this.renameTarget.set(null);
    this.catalogNameForm.reset({ name: '' });
  }

  saveRename(): void {
    const target = this.renameTarget();
    if (!target || this.catalogNameForm.invalid) return;
    const name = this.catalogNameForm.controls.name.value.trim();
    this.busy.set(true);
    this.clearMessages();
    const request = target.resource === 'categories'
      ? this.api.updateCategory(target.id, target.version, name)
      : this.api.updateSupermarket(target.id, target.version, name);
    request.subscribe({
      next: () => {
        this.renameTarget.set(null);
        this.catalogNameForm.reset({ name: '' });
        this.shopping.invalidateList();
        this.shopping.invalidatePrices();
        this.load(target.resource === 'categories' ? 'Categoria rinominata.' : 'Supermercato rinominato.');
      },
      error: () => this.failed('Il nome non \u00e8 stato aggiornato. Ricarica e riprova.')
    });
  }

  deleteResource(
    resource: CatalogResource,
    item: { id: number; version: number },
    replacementCategoryId?: number | null
  ): void {
    this.busy.set(true); this.clearMessages();
    const request = replacementCategoryId === undefined
      ? this.api.deleteCatalog(resource, item.id, item.version)
      : this.api.deleteCatalog(resource, item.id, item.version, replacementCategoryId);
    request.subscribe({
      next: () => { this.shopping.invalidateAll(); this.load('Elemento eliminato definitivamente.'); },
      error: () => this.failed('L\u2019elemento \u00e8 stato modificato: ricarica e riprova.')
    });
  }

  requestDelete(resource: CatalogResource, item: { id: number; version: number; name: string }): void {
    this.clearMessages();
    this.categoryDeletionForm.reset({ replacementCategoryId: '' });
    this.deleteTarget.set({ resource, id: item.id, version: item.version, label: item.name });
  }

  closeDelete(): void {
    if (this.busy()) return;
    this.deleteTarget.set(null);
    this.categoryDeletionForm.reset({ replacementCategoryId: '' });
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) return;
    const replacementValue = this.categoryDeletionForm.controls.replacementCategoryId.value;
    const replacementCategoryId = target.resource === 'categories'
      ? (replacementValue ? Number(replacementValue) : null)
      : undefined;
    this.deleteTarget.set(null);
    this.deleteResource(target.resource, target, replacementCategoryId);
  }

  categoryProductCount(categoryId: number): number {
    return (this.overview()?.products ?? [])
      .filter((product) => Number(product.category_id) === categoryId).length;
  }

  supermarketPriceCount(supermarketId: number): number {
    return Number((this.overview()?.supermarket_price_counts ?? [])
      .find((entry) => Number(entry.id) === supermarketId)?.count ?? 0);
  }

  supermarketItemCount(supermarketId: number): number {
    return Number((this.overview()?.supermarket_item_counts ?? [])
      .find((entry) => Number(entry.id) === supermarketId)?.count ?? 0);
  }

  recipesForProduct(productId: number): ProductRecipeUsage[] {
    return (this.overview()?.product_recipe_usages ?? [])
      .filter((usage) => Number(usage.product_id) === productId);
  }

  replacementCategories(categoryId: number) {
    return (this.overview()?.categories ?? [])
      .filter((category) => Number(category.id) !== categoryId);
  }

  selectImage(event: Event): void {
    this.image.set((event.target as HTMLInputElement).files?.[0]);
  }

  setFilter(event: Event): void { this.filter.set((event.target as HTMLInputElement).value); }
  hasImage(product: Product): boolean { return !!product.image_attachment_id; }
  resourceName(resource: CatalogResource): string {
    return resource === 'products' ? 'prodotto' : resource === 'categories' ? 'categoria' : 'supermercato';
  }

  private clearMessages(): void { this.error.set(''); this.success.set(''); }
  private failed(message: string): void { this.error.set(message); this.busy.set(false); }
  private resetProductEditor(): void {
    this.editId.set(null);
    this.image.set(undefined);
    this.productForm.reset({ name: '', categoryId: '' });
  }

  private detectCameraCapture(): boolean {
    if (typeof navigator === 'undefined' || typeof window === 'undefined'
      || typeof window.matchMedia !== 'function') return false;
    return navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
  }
}
