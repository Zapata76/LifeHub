/**
 * Coordinates product, category, and supermarket maintenance for authorized users.
 * Image bytes remain behind the private attachment API.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SessionStore } from '../../core/session.store';
import { ModalBackdropDirective } from '../../shared/modal-backdrop.directive';
import { ShoppingApiService } from './shopping-api.service';
import { Product, ShoppingOverview } from './shopping.models';

type CatalogResource = 'products' | 'categories' | 'supermarkets';
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
  readonly overview = signal<ShoppingOverview | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly filter = signal('');
  readonly productModalOpen = signal(false);
  readonly editId = signal<number | null>(null);
  readonly image = signal<File | undefined>(undefined);
  readonly deleteTarget = signal<CatalogDeleteTarget | null>(null);
  readonly canCapturePhoto = this.detectCameraCapture();
  readonly productForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    categoryId: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });
  readonly categoryForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });
  readonly marketForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });
  readonly products = computed(() => {
    const term = this.filter().trim().toLocaleLowerCase('it');
    return (this.overview()?.products ?? []).filter((product) => !term
      || product.name.toLocaleLowerCase('it').includes(term)
      || (product.category_name ?? '').toLocaleLowerCase('it').includes(term));
  });
  readonly canManage = computed(() => ['admin', 'adult'].includes(this.store.user()?.role ?? ''));

  constructor() { this.load(); }

  load(message = ''): void {
    this.loading.set(true);
    this.api.overview().subscribe({
      next: (overview) => {
        this.overview.set(overview); this.loading.set(false); this.busy.set(false);
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

  createCategory(): void {
    if (this.categoryForm.invalid) return;
    this.busy.set(true); this.clearMessages();
    this.api.createCategory(this.categoryForm.controls.name.value.trim()).subscribe({
      next: () => { this.categoryForm.reset({ name: '' }); this.load('Categoria aggiunta.'); },
      error: () => this.failed('La categoria non è stata aggiunta.')
    });
  }

  createMarket(): void {
    if (this.marketForm.invalid) return;
    this.busy.set(true); this.clearMessages();
    this.api.createSupermarket(this.marketForm.controls.name.value.trim()).subscribe({
      next: () => { this.marketForm.reset({ name: '' }); this.load('Supermercato aggiunto.'); },
      error: () => this.failed('Il supermercato non è stato aggiunto.')
    });
  }

  deleteResource(resource: CatalogResource, item: { id: number; version: number }): void {
    this.busy.set(true); this.clearMessages();
    this.api.deleteCatalog(resource, item.id, item.version).subscribe({
      next: () => this.load('Elemento eliminato definitivamente.'),
      error: () => this.failed('L’elemento è stato modificato: ricarica e riprova.')
    });
  }

  requestDelete(resource: CatalogResource, item: { id: number; version: number; name: string }): void {
    this.clearMessages();
    this.deleteTarget.set({ resource, id: item.id, version: item.version, label: item.name });
  }

  closeDelete(): void { if (!this.busy()) this.deleteTarget.set(null); }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleteTarget.set(null);
    this.deleteResource(target.resource, target);
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
