import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SessionStore } from '../../core/session.store';
import { ShoppingApiService } from './shopping-api.service';
import { ShoppingOverview } from './shopping.models';
import { ShoppingPricesComponent } from './shopping-prices.component';

const overview: ShoppingOverview = {
  lists: [], items: [], categories: [], supermarkets: [], products: [],
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
