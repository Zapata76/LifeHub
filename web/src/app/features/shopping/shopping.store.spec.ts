import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ShoppingApiService } from './shopping-api.service';
import { ShoppingListOverview } from './shopping.models';
import { ShoppingStore } from './shopping.store';

describe('ShoppingStore', () => {
  it('reuses a loaded tab payload until that slice is invalidated', () => {
    const overview: ShoppingListOverview = { lists: [], items: [], supermarkets: [], products: [] };
    const listOverview = vi.fn(() => of(overview));
    TestBed.configureTestingModule({
      providers: [
        ShoppingStore,
        {
          provide: ShoppingApiService,
          useValue: {
            listOverview,
            catalogOverview: vi.fn(),
            pricesOverview: vi.fn()
          }
        }
      ]
    });
    const store = TestBed.inject(ShoppingStore);

    store.loadList().subscribe();
    store.loadList().subscribe();
    expect(listOverview).toHaveBeenCalledTimes(1);

    store.invalidateList();
    store.loadList().subscribe();
    expect(listOverview).toHaveBeenCalledTimes(2);
  });
});
