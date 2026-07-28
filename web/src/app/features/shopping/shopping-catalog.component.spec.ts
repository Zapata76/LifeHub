import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SessionStore } from '../../core/session.store';
import { ShoppingApiService } from './shopping-api.service';
import { ShoppingCatalogComponent } from './shopping-catalog.component';
import { ShoppingOverview } from './shopping.models';

const overview: ShoppingOverview = {
  lists: [], items: [], prices: [],
  categories: [{ id: 1, name: 'Bevande', version: 1 }],
  supermarkets: [{ id: 2, name: 'Conad', version: 1 }],
  products: [
    { id: 3, category_id: 1, name: 'Acqua', category_name: 'Bevande', image_attachment_id: null, version: 1 }
  ]
};

describe('ShoppingCatalogComponent', () => {
  it('uses the 5a fallback and asks for confirmation before physical deletion', async () => {
    const deleteCatalog = vi.fn(() => of(undefined));
    await TestBed.configureTestingModule({
      imports: [ShoppingCatalogComponent],
      providers: [{ provide: ShoppingApiService, useValue: {
        overview: () => of(overview), deleteCatalog, attachment: (id: number) => `attachment/${id}`
      } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
    const fixture = TestBed.createComponent(ShoppingCatalogComponent);
    fixture.detectChanges();

    const fallback = fixture.nativeElement.querySelector('.product-placeholder img') as HTMLImageElement;
    expect(fallback.getAttribute('src')).toBe('icons/5a.png');
    const remove = fixture.nativeElement.querySelector('.product-card .danger') as HTMLButtonElement;
    remove.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(deleteCatalog).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('[role="alertdialog"] .danger') as HTMLButtonElement).click();
    expect(deleteCatalog).toHaveBeenCalledWith('products', 3, 1);
    fixture.componentInstance.openCreate(); fixture.detectChanges();
    const fileInput = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.getAttribute('capture')).toBeNull();
    expect(fileInput.getAttribute('accept')).toBe('image/jpeg,image/png');
  });

  it('enables the rear camera only for a touch device with a coarse pointer', async () => {
    const originalTouchPoints = navigator.maxTouchPoints;
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true })) });
    try {
      await TestBed.configureTestingModule({
        imports: [ShoppingCatalogComponent],
        providers: [{ provide: ShoppingApiService, useValue: { overview: () => of(overview) } }]
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
