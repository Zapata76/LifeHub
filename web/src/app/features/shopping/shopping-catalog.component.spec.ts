import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SessionStore } from '../../core/session.store';
import { ShoppingApiService } from './shopping-api.service';
import { ShoppingCatalogComponent } from './shopping-catalog.component';
import { ShoppingOverview } from './shopping.models';
import { ShoppingStore } from './shopping.store';

const overview: ShoppingOverview = {
  lists: [{ id: 1, name: 'Spesa', is_primary: 1, version: 1 }],
  items: [{
    id: 5, list_id: 1, product_id: 3, supermarket_id: 2, label: 'Acqua', quantity_raw: '1',
    checked: 0, product_name: 'Acqua', category_name: 'Bevande', supermarket_name: 'Conad',
    image_attachment_id: null, version: 1
  }],
  prices: [{
    id: 6, product_id: 3, supermarket_id: 2, amount: '1.20', currency: 'EUR',
    package_text: null, observed_on: null, created_at: '2026-08-29 10:00:00',
    product_name: 'Acqua', category_name: 'Bevande', supermarket_name: 'Conad',
    username: 'admin', image_attachment_id: null, version: 1
  }],
  categories: [{ id: 1, name: 'Bevande', version: 1 }, { id: 4, name: 'Dispensa', version: 1 }],
  supermarkets: [{ id: 2, name: 'Conad', version: 1 }],
  products: [
    { id: 3, category_id: 1, name: 'Acqua', category_name: 'Bevande', image_attachment_id: null, version: 1 },
    { id: 7, category_id: 4, name: 'Pane', category_name: 'Dispensa', image_attachment_id: 20, version: 1 }
  ],
  product_recipe_usages: [
    { product_id: 3, recipe_id: 11, recipe_title: 'Torta all\'acqua' },
    { product_id: 3, recipe_id: 12, recipe_title: 'Pane fatto in casa' }
  ],
  active_product_ids: [{ id: 3 }],
  supermarket_item_counts: [{ id: 2, count: 1 }],
  supermarket_price_counts: [{ id: 2, count: 1 }]
};

describe('ShoppingCatalogComponent', () => {
  it('uses the 5a fallback and asks for confirmation before physical deletion', async () => {
    const deleteCatalog = vi.fn(() => of(undefined));
    await TestBed.configureTestingModule({
      imports: [ShoppingCatalogComponent],
      providers: [ShoppingStore, { provide: ShoppingApiService, useValue: {
        catalogOverview: () => of(overview), deleteCatalog, attachment: (id: number) => `attachment/${id}`
      } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
    const fixture = TestBed.createComponent(ShoppingCatalogComponent);
    fixture.detectChanges();

    const fallback = fixture.nativeElement.querySelector('.product-placeholder img') as HTMLImageElement;
    expect(fallback.getAttribute('src')).toBe('icons/5a.png');
    const productImage = fixture.nativeElement.querySelector('img[src="attachment/20"]') as HTMLImageElement;
    expect(productImage.getAttribute('loading')).toBe('lazy');
    expect(productImage.getAttribute('decoding')).toBe('async');

    const remove = fixture.nativeElement.querySelector('.product-card .danger') as HTMLButtonElement;
    remove.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('2 ricette');
    expect(fixture.nativeElement.textContent).toContain('Torta all\'acqua');
    expect(fixture.nativeElement.textContent).toContain('Pane fatto in casa');
    expect(fixture.nativeElement.textContent).toContain('resteranno nelle ricette come testo libero');
    const footnote = fixture.nativeElement.querySelector('[role="alertdialog"] small.wide') as HTMLElement;
    expect(footnote).not.toBeNull();
    expect(deleteCatalog).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('[role="alertdialog"] button.danger') as HTMLButtonElement).click();
    expect(deleteCatalog).toHaveBeenCalledWith('products', 3, 1);
    fixture.componentInstance.openCreate(); fixture.detectChanges();
    const fileInput = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.getAttribute('capture')).toBeNull();
    expect(fileInput.getAttribute('accept')).toBe('image/jpeg,image/png');
    expect(fixture.nativeElement.textContent).toContain('lato lungo massimo 960 px');
  });

  it('renames catalogue entries and explains deletion impact before confirming', async () => {
    const updateCategory = vi.fn(() => of(undefined));
    const updateSupermarket = vi.fn(() => of(undefined));
    const deleteCatalog = vi.fn(() => of(undefined));
    await TestBed.configureTestingModule({
      imports: [ShoppingCatalogComponent],
      providers: [ShoppingStore, { provide: ShoppingApiService, useValue: {
        catalogOverview: () => of(overview),
        updateCategory,
        updateSupermarket,
        deleteCatalog,
        attachment: (id: number) => 'attachment/' + id
      } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
    const fixture = TestBed.createComponent(ShoppingCatalogComponent);
    fixture.detectChanges();

    fixture.componentInstance.requestRename('categories', overview.categories[0]);
    fixture.componentInstance.catalogNameForm.controls.name.setValue('Bibite');
    fixture.componentInstance.saveRename();
    expect(updateCategory).toHaveBeenCalledWith(1, 1, 'Bibite');

    fixture.componentInstance.requestRename('supermarkets', overview.supermarkets[0]);
    fixture.componentInstance.catalogNameForm.controls.name.setValue('Conad City');
    fixture.componentInstance.saveRename();
    expect(updateSupermarket).toHaveBeenCalledWith(2, 1, 'Conad City');

    fixture.componentInstance.requestDelete('categories', overview.categories[0]);
    fixture.componentInstance.categoryDeletionForm.controls.replacementCategoryId.setValue('4');
    fixture.componentInstance.confirmDelete();
    expect(deleteCatalog).toHaveBeenCalledWith('categories', 1, 1, 4);

    fixture.componentInstance.requestDelete('supermarkets', overview.supermarkets[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1 rilevazione di prezzo');
    expect(fixture.nativeElement.textContent).toContain('1 riga della spesa');
    fixture.componentInstance.confirmDelete();
    expect(deleteCatalog).toHaveBeenCalledWith('supermarkets', 2, 1);
  });
  it('shows list membership and quickly adds a missing product to the primary list', async () => {
    const addItem = vi.fn(() => of({ id: 20 }));
    await TestBed.configureTestingModule({
      imports: [ShoppingCatalogComponent],
      providers: [ShoppingStore, { provide: ShoppingApiService, useValue: {
        catalogOverview: () => of(overview),
        addItem,
        attachment: (id: number) => 'attachment/' + id
      } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
    const fixture = TestBed.createComponent(ShoppingCatalogComponent);
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('.product-list-status') as HTMLElement;
    expect(status.textContent).toContain('Attualmente in lista');
    const add = fixture.nativeElement.querySelector('[aria-label="Aggiungi Pane alla lista"]') as HTMLButtonElement;
    expect(add).not.toBeNull();
    add.click();

    expect(addItem).toHaveBeenCalledWith({
      listId: 1,
      productId: 7,
      supermarketId: null,
      quantity: '1'
    });
  });

  it('uses product-style headings, toolbars, cards, and creation modals for catalogues', async () => {
    const createCategory = vi.fn(() => of(undefined));
    const createSupermarket = vi.fn(() => of(undefined));
    await TestBed.configureTestingModule({
      imports: [ShoppingCatalogComponent],
      providers: [ShoppingStore, { provide: ShoppingApiService, useValue: {
        catalogOverview: () => of(overview),
        createCategory,
        createSupermarket,
        attachment: (id: number) => 'attachment/' + id
      } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
    const fixture = TestBed.createComponent(ShoppingCatalogComponent);
    fixture.componentRef.setInput('section', 'categories');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.catalog-list-heading h2').textContent).toContain('Categorie (2)');
    expect(fixture.nativeElement.querySelectorAll('.catalog-entity-card')).toHaveLength(2);
    const newCategory = Array.from(
      fixture.nativeElement.querySelectorAll('.catalog-toolbar button') as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.includes('Nuova categoria'))!;
    newCategory.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#catalog-create-title').textContent).toContain('Nuova categoria');
    fixture.componentInstance.catalogCreateForm.controls.name.setValue('Casa');
    fixture.componentInstance.createCatalog();
    expect(createCategory).toHaveBeenCalledWith('Casa');

    fixture.componentRef.setInput('section', 'supermarkets');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.catalog-list-heading h2').textContent)
      .toContain('Supermercati (1)');
    expect(fixture.nativeElement.querySelectorAll('.catalog-entity-card')).toHaveLength(1);
    fixture.componentInstance.openCatalogCreate('supermarkets');
    fixture.componentInstance.catalogCreateForm.controls.name.setValue('Mercato');
    fixture.componentInstance.createCatalog();
    expect(createSupermarket).toHaveBeenCalledWith('Mercato');
  });

  it('enables the rear camera only for a touch device with a coarse pointer', async () => {
    const originalTouchPoints = navigator.maxTouchPoints;
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true })) });
    try {
      await TestBed.configureTestingModule({
        imports: [ShoppingCatalogComponent],
        providers: [ShoppingStore, { provide: ShoppingApiService, useValue: {
          catalogOverview: () => of(overview), attachment: (id: number) => 'attachment/' + id
        } }]
      }).compileComponents();
      TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
      const fixture = TestBed.createComponent(ShoppingCatalogComponent);
      fixture.componentInstance.openCreate(); fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input.getAttribute('capture')).toBe('environment');
      expect(input.getAttribute('accept')).toBe('image/*');
    } finally {
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: originalTouchPoints });
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
    }
  });
});
