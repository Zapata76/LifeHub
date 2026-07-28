import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ShoppingApiService } from './shopping-api.service';
import { ShoppingListComponent } from './shopping-list.component';
import { ShoppingOverview } from './shopping.models';

const overview: ShoppingOverview = {
  lists: [{ id: 1, name: 'Spesa', is_primary: 1, version: 1 }],
  items: [],
  categories: [],
  supermarkets: [],
  products: [
    { id: 10, category_id: 1, name: 'Salsiccia', category_name: 'Carne', image_attachment_id: null, version: 1 },
    { id: 11, category_id: 2, name: 'Ricotta salata', category_name: 'Formaggi e latticini',
      image_attachment_id: null, version: 1 }
  ],
  prices: []
};

describe('ShoppingListComponent', () => {
  it('renders photos inside product details, omits missing-photo boxes, and clears checked rows after confirmation', async () => {
    const clearChecked = vi.fn(() => of({ removed: 1 }));
    const withItems: ShoppingOverview = { ...overview, items: [
      { id: 1, list_id: 1, product_id: 10, supermarket_id: null, label: 'Salsiccia', quantity_raw: '1',
        checked: 1, product_name: 'Salsiccia', category_name: 'Carne', supermarket_name: null,
        image_attachment_id: null, version: 1 },
      { id: 2, list_id: 1, product_id: 11, supermarket_id: null, label: 'Ricotta', quantity_raw: '1',
        checked: 0, product_name: 'Ricotta', category_name: 'Formaggi', supermarket_name: null,
        image_attachment_id: 30, version: 1 }
    ] };
    await TestBed.configureTestingModule({
      imports: [ShoppingListComponent],
      providers: [{ provide: ShoppingApiService, useValue: {
        overview: () => of(withItems), clearChecked, attachment: (id: number) => `attachment/${id}`
      } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(ShoppingListComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.shopping-list-thumb')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.shopping-product .shopping-list-thumb')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.product-thumb.empty')).toBeNull();
    const clearButton = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((button) => (button as HTMLButtonElement).textContent?.includes('Pulisci')) as HTMLButtonElement;
    clearButton.click(); fixture.detectChanges();
    expect(clearChecked).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('[role="alertdialog"] .danger') as HTMLButtonElement).click();
    expect(clearChecked).toHaveBeenCalledWith(1);
  });

  it('shows live matches and selects a product from the add modal', async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingListComponent],
      providers: [{ provide: ShoppingApiService, useValue: { overview: () => of(overview) } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(ShoppingListComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    fixture.componentInstance.openAdd();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLInputElement;
    input.value = 'sal';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const results = Array.from(fixture.nativeElement.querySelectorAll('.shopping-product-results button')) as HTMLButtonElement[];
    expect(results.map((button) => button.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Salsiccia'), expect.stringContaining('Ricotta salata')
    ]));

    results[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.addForm.controls.productId.value).toBe('10');
    expect(fixture.componentInstance.productResultsOpen()).toBe(false);
  });

  it('closes the add modal after a successful addition', async () => {
    const addItem = vi.fn(() => of({ id: 20 }));
    await TestBed.configureTestingModule({
      imports: [ShoppingListComponent],
      providers: [{ provide: ShoppingApiService, useValue: { overview: () => of(overview), addItem } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(ShoppingListComponent);
    fixture.componentInstance.openAdd();
    fixture.componentInstance.addForm.patchValue({ productId: '10', quantity: '1' });
    fixture.componentInstance.add();

    expect(addItem).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.addModalOpen()).toBe(false);
  });

  it('closes and exposes the error when the product is already on the list', async () => {
    const duplicate = new HttpErrorResponse({
      status: 409,
      error: { error: { code: 'shopping.duplicate', message: 'Il prodotto è già presente.' } }
    });
    const addItem = vi.fn(() => throwError(() => duplicate));
    const load = vi.fn(() => of(overview));
    await TestBed.configureTestingModule({
      imports: [ShoppingListComponent],
      providers: [{ provide: ShoppingApiService, useValue: { overview: load, addItem } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(ShoppingListComponent);
    fixture.componentInstance.openAdd();
    fixture.componentInstance.addForm.patchValue({ productId: '10', quantity: '1' });
    fixture.componentInstance.add();

    expect(fixture.componentInstance.addModalOpen()).toBe(false);
    expect(fixture.componentInstance.error()).toBe('Il prodotto è già presente.');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
