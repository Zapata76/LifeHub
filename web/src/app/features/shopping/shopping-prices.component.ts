/**
 * Coordinates price capture and searchable household price history.
 * Amount validation is duplicated only for immediate UX; the API remains authoritative.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SessionStore } from '../../core/session.store';
import { ShoppingApiService } from './shopping-api.service';
import { PriceRecord, ShoppingOverview } from './shopping.models';

interface PriceGroup {
  productId: number;
  productName: string;
  categoryName: string | null;
  records: PriceRecord[];
  lowest: PriceRecord;
}

@Component({
  selector: 'lh-shopping-prices',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shopping-prices.component.html'
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
  readonly image = signal<File | undefined>(undefined);
  readonly deleteTarget = signal<PriceRecord | null>(null);
  readonly form = new FormGroup({
    productId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    supermarketId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    packageText: new FormControl('', { nonNullable: true }),
    observedOn: new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true })
  });
  readonly prices = computed(() => {
    const term = this.filter().trim().toLocaleLowerCase('it');
    return (this.overview()?.prices ?? []).filter((price) => !term
      || price.product_name.toLocaleLowerCase('it').includes(term)
      || price.supermarket_name.toLocaleLowerCase('it').includes(term)
      || (price.category_name ?? '').toLocaleLowerCase('it').includes(term));
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

  save(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.busy.set(true); this.error.set(''); this.success.set('');
    this.api.createPrice({
      product_id: Number(value.productId), supermarket_id: Number(value.supermarketId),
      amount: Number(value.amount), currency: 'EUR', package_text: value.packageText.trim() || null,
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
  hasImage(price: PriceRecord): boolean { return !!price.image_attachment_id; }
  formatDate(value: string | null): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
    return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Data non indicata';
  }

  private resetEditor(): void {
    this.image.set(undefined);
    this.form.reset({ productId: '', supermarketId: '', amount: null, packageText: '',
      observedOn: new Date().toISOString().slice(0, 10) });
  }
}
