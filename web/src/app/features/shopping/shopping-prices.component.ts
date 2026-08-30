/**
 * Coordinates price capture and searchable household price history.
 * Amount validation is duplicated only for immediate UX; the API remains authoritative.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { SessionStore } from '../../core/session.store';
import { ModalBackdropDirective } from '../../shared/modal-backdrop.directive';
import { matchingProducts } from './product-search';
import { ShoppingApiService } from './shopping-api.service';
import { PriceRecord, Product, ShoppingOverview } from './shopping.models';

interface PriceGroup {
  productId: number;
  productName: string;
  categoryName: string | null;
  records: PriceRecord[];
  lowest: PriceRecord;
}
type PackageUnit = '' | 'g' | 'kg' | 'ml' | 'cl' | 'l' | 'pz';

const unitPriceFormatter = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function optionalPackage(control: AbstractControl): ValidationErrors | null {
  const amount = control.get('packageAmount')?.value;
  const unit = control.get('packageUnit')?.value;
  return (amount !== null && amount !== '') === !!unit ? null : { incompletePackage: true };
}


@Component({
  selector: 'lh-shopping-prices',
  standalone: true,
  imports: [ReactiveFormsModule, ModalBackdropDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shopping-prices.component.html',
})
export class ShoppingPricesComponent {
  readonly api = inject(ShoppingApiService);
  readonly store = inject(SessionStore);
  readonly overview = signal<ShoppingOverview | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly filter = signal('');
  readonly priceModalOpen = signal(false);
  readonly productSearch = signal('');
  readonly productResultsOpen = signal(false);
  readonly highlightedProductIndex = signal(-1);
  readonly image = signal<File | undefined>(undefined);
  readonly deleteTarget = signal<PriceRecord | null>(null);
  readonly form = new FormGroup({
    productSearch: new FormControl('', { nonNullable: true }),
    productId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    supermarketId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    packageAmount: new FormControl<number | null>(null, [Validators.min(0.01)]),
    packageUnit: new FormControl<PackageUnit>('', { nonNullable: true }),
    observedOn: new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true })
  }, { validators: optionalPackage });
  readonly prices = computed(() => {
    const term = this.filter().trim().toLocaleLowerCase('it');
    return (this.overview()?.prices ?? []).filter((price) => !term
      || price.product_name.toLocaleLowerCase('it').includes(term)
      || price.supermarket_name.toLocaleLowerCase('it').includes(term)
      || (price.category_name ?? '').toLocaleLowerCase('it').includes(term));
  });
  readonly availableProducts = computed(() => {
    return matchingProducts(this.overview()?.products ?? [], this.productSearch());
  });
  readonly priceGroups = computed<PriceGroup[]>(() => {
    const grouped = new Map<number, PriceGroup>();
    for (const price of this.prices()) {
      const current = grouped.get(price.product_id);
      if (!current) {
        grouped.set(price.product_id, {
          productId: price.product_id,
          productName: price.product_name,
          categoryName: price.category_name,
          records: [price],
          lowest: price
        });
        continue;
      }
      current.records.push(price);
      if (Number(price.amount) < Number(current.lowest.amount)) current.lowest = price;
    }
    return Array.from(grouped.values());
  });
  readonly canManage = computed(() => ['admin', 'adult'].includes(this.store.user()?.role ?? ''));

  constructor() { this.load(); }

  load(message = ''): void {
    this.loading.set(true);
    this.api.overview().subscribe({
      next: (overview) => {
        this.overview.set(overview); this.loading.set(false); this.busy.set(false); this.success.set(message);
      },
      error: () => { this.error.set('Impossibile caricare lo storico prezzi.'); this.loading.set(false); this.busy.set(false); }
    });
  }

  openPriceModal(): void {
    this.resetEditor();
    this.priceModalOpen.set(true);
  }

  closePriceModal(): void {
    if (this.busy()) return;
    this.priceModalOpen.set(false);
    this.resetEditor();
  }

  searchProducts(value: string): void {
    this.productSearch.set(value);
    this.form.controls.productId.setValue('');
    this.productResultsOpen.set(value.trim().length > 0);
    this.highlightedProductIndex.set(-1);
  }

  openProductResults(): void {
    this.productResultsOpen.set(this.productSearch().trim().length > 0);
  }

  closeProductResults(event: FocusEvent): void {
    const container = event.currentTarget as HTMLElement | null;
    const next = event.relatedTarget as Node | null;
    if (container && next && container.contains(next)) return;
    this.productResultsOpen.set(false);
    this.highlightedProductIndex.set(-1);
  }

  selectProduct(product: Product): void {
    this.productSearch.set(product.name);
    this.form.patchValue({ productSearch: product.name, productId: String(product.id) });
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

  save(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.busy.set(true); this.error.set(''); this.success.set('');
    this.api.createPrice({
      product_id: Number(value.productId), supermarket_id: Number(value.supermarketId),
      amount: Number(value.amount), currency: 'EUR',
      package_text: this.packageText(value.packageAmount, value.packageUnit),
      observed_on: value.observedOn || null
    }, this.image()).subscribe({
      next: () => {
        this.priceModalOpen.set(false);
        this.resetEditor();
        this.load('Prezzo registrato.');
      },
      error: () => { this.error.set('Il prezzo non è stato registrato.'); this.busy.set(false); }
    });
  }

  deleteResource(price: PriceRecord): void {
    this.busy.set(true); this.error.set(''); this.success.set('');
    this.api.deleteCatalog('prices', price.id, price.version).subscribe({
      next: () => this.load('Registrazione eliminata definitivamente.'),
      error: () => { this.error.set('La registrazione è cambiata: ricarica e riprova.'); this.busy.set(false); }
    });
  }

  requestDelete(price: PriceRecord): void { this.deleteTarget.set(price); }
  closeDelete(): void { if (!this.busy()) this.deleteTarget.set(null); }
  confirmDelete(): void {
    const price = this.deleteTarget();
    if (!price) return;
    this.deleteTarget.set(null);
    this.deleteResource(price);
  }

  selectImage(event: Event): void { this.image.set((event.target as HTMLInputElement).files?.[0]); }
  setFilter(event: Event): void { this.filter.set((event.target as HTMLInputElement).value); }
  value(event: Event): string { return (event.target as HTMLInputElement).value; }
  hasImage(price: PriceRecord): boolean { return !!price.image_attachment_id; }
  unitPriceLabel(price: PriceRecord): string | null {
    const match = /^\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|l|pz)\s*$/i.exec(price.package_text ?? '');
    const quantity = match ? Number(match[1].replace(',', '.')) : 0;
    const amount = Number(price.amount);
    if (!match || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(amount)) return null;
    const unit = match[2].toLocaleLowerCase('it');
    const baseQuantity = unit === 'g' ? quantity / 1000
      : unit === 'ml' ? quantity / 1000
      : unit === 'cl' ? quantity / 100
      : quantity;
    const baseUnit = unit === 'g' || unit === 'kg' ? 'kg' : unit === 'pz' ? 'pz' : 'l';
    const currency = price.currency === 'EUR' ? '€' : price.currency;
    return `${unitPriceFormatter.format(amount / baseQuantity)} ${currency}/${baseUnit}`;
  }

  formatDate(value: string | null): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
    return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Data non indicata';
  }

  private resetEditor(): void {
    this.image.set(undefined);
    this.productSearch.set('');
    this.productResultsOpen.set(false);
    this.highlightedProductIndex.set(-1);
    this.form.reset({ productSearch: '', productId: '', supermarketId: '', amount: null,
      packageAmount: null, packageUnit: '',
      observedOn: new Date().toISOString().slice(0, 10) });
  }

  private packageText(amount: number | null, unit: PackageUnit): string | null {
    return amount !== null && unit ? `${amount} ${unit}` : null;
  }
}
