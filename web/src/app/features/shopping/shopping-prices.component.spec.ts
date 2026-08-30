import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SessionStore } from '../../core/session.store';
import { ShoppingApiService } from './shopping-api.service';
import { ShoppingOverview } from './shopping.models';
import { ShoppingPricesComponent } from './shopping-prices.component';

const overview: ShoppingOverview = {
  lists: [], items: [], categories: [], supermarkets: [],
  products: [
    { id: 20, category_id: 1, name: 'Salsiccia', category_name: 'Carne',
      image_attachment_id: null, version: 1 },
    { id: 21, category_id: 2, name: 'Ricotta salata', category_name: 'Formaggi e latticini',
      image_attachment_id: null, version: 1 }
  ],
  product_recipe_usages: [],
  prices: [
    { id: 1, product_id: 10, supermarket_id: 1, amount: '3.20', currency: 'EUR', package_text: '500 g',
      observed_on: '2026-07-18', created_at: '2026-07-18 10:00:00', product_name: 'Pasta',
      category_name: 'Alimentari', supermarket_name: 'Conad', username: 'Emiliano',
      image_attachment_id: null, version: 1 },
    { id: 2, product_id: 10, supermarket_id: 2, amount: '2.80', currency: 'EUR', package_text: '500 g',
      observed_on: '2026-07-17', created_at: '2026-07-17 10:00:00', product_name: 'Pasta',
      category_name: 'Alimentari', supermarket_name: 'Decò', username: 'Simona',
      image_attachment_id: null, version: 1 },
    { id: 3, product_id: 11, supermarket_id: 1, amount: '1.50', currency: 'EUR', package_text: null,
      observed_on: '2026-07-16', created_at: '2026-07-16 10:00:00', product_name: 'Latte',
      category_name: 'Bevande', supermarket_name: 'Conad', username: null,
      image_attachment_id: null, version: 1 }
  ]
};

describe('ShoppingPricesComponent', () => {
  it('groups observations by product and renders one compact row per registration', async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingPricesComponent],
      providers: [{ provide: ShoppingApiService, useValue: { overview: () => of(overview) } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
    const fixture = TestBed.createComponent(ShoppingPricesComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.priceGroups()).toHaveLength(2);
    expect(fixture.componentInstance.priceGroups()[0].records).toHaveLength(2);
    expect(fixture.componentInstance.priceGroups()[0].lowest.amount).toBe('2.80');
    expect(fixture.nativeElement.querySelectorAll('.price-product-group')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.price-observation')).toHaveLength(3);
    expect(fixture.nativeElement.textContent).toContain('6,40 €/kg');
    expect(fixture.nativeElement.textContent).toContain('5,60 €/kg');
    expect(fixture.componentInstance.unitPriceLabel({ ...overview.prices[2], package_text: '750 ml' })).toBe('2,00 €/l');
  });

  it('replaces the product select with an alphabetic searchable product list', async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingPricesComponent],
      providers: [{ provide: ShoppingApiService, useValue: { overview: () => of(overview) } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
    const fixture = TestBed.createComponent(ShoppingPricesComponent);
    fixture.componentInstance.openPriceModal();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('select[formControlName="productId"]')).toBeNull();
    const input = fixture.nativeElement.querySelector(
      'input[formControlName="productSearch"]'
    ) as HTMLInputElement;
    input.value = 'sal';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.availableProducts().map((product) => product.name))
      .toEqual(['Ricotta salata', 'Salsiccia']);
    const results = Array.from(
      fixture.nativeElement.querySelectorAll('#price-product-results button')
    ) as HTMLButtonElement[];
    expect(results.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Ricotta salata'),
      expect.stringContaining('Salsiccia')
    ]);

    results[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.productId.value).toBe('20');
    expect(input.value).toBe('Salsiccia');

    input.value = 'Salsiccia fresca';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.form.controls.productId.value).toBe('');
  });

  it('keeps the format optional and saves quantity plus unit in a canonical form', async () => {
    const createPrice = vi.fn(() => of(undefined));
    await TestBed.configureTestingModule({
      imports: [ShoppingPricesComponent],
      providers: [{ provide: ShoppingApiService, useValue: { overview: () => of(overview), createPrice } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
    const fixture = TestBed.createComponent(ShoppingPricesComponent);
    fixture.componentInstance.openPriceModal();
    fixture.componentInstance.form.patchValue({
      productSearch: 'Salsiccia', productId: '20', supermarketId: '1', amount: 4.5,
      packageAmount: null, packageUnit: '', observedOn: '2026-08-30'
    });

    expect(fixture.componentInstance.form.valid).toBe(true);
    fixture.componentInstance.form.patchValue({ packageAmount: 500 });
    expect(fixture.componentInstance.form.hasError('incompletePackage')).toBe(true);
    fixture.componentInstance.form.patchValue({ packageUnit: 'g' });
    expect(fixture.componentInstance.form.valid).toBe(true);

    fixture.componentInstance.save();
    expect(createPrice).toHaveBeenCalledWith({
      product_id: 20, supermarket_id: 1, amount: 4.5, currency: 'EUR',
      package_text: '500 g', observed_on: '2026-08-30'
    }, undefined);
  });

  it('requires confirmation before deleting a price registration', async () => {
    const deleteCatalog = vi.fn(() => of(undefined));
    await TestBed.configureTestingModule({
      imports: [ShoppingPricesComponent],
      providers: [{ provide: ShoppingApiService, useValue: { overview: () => of(overview), deleteCatalog } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
    const fixture = TestBed.createComponent(ShoppingPricesComponent);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.price-observation .danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(deleteCatalog).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('[role="alertdialog"] .danger') as HTMLButtonElement).click();
    expect(deleteCatalog).toHaveBeenCalledWith('prices', 1, 1);
  });
});
