import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SessionStore } from '../../core/session.store';
import { ShoppingApiService } from './shopping-api.service';
import { ShoppingPageComponent } from './shopping-page.component';
import { ShoppingOverview } from './shopping.models';

const overview: ShoppingOverview = {
  lists: [{ id: 1, name: 'Spesa', is_primary: 1, version: 1 }],
  items: [],
  categories: [{ id: 2, name: 'Dispensa', version: 1 }],
  supermarkets: [{ id: 3, name: 'Conad', version: 1 }],
  products: [],
  product_recipe_usages: [],
  prices: []
};

describe('ShoppingPageComponent', () => {
  it('shows the five shopping sections in the requested order', async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingPageComponent],
      providers: [{ provide: ShoppingApiService, useValue: {
        overview: () => of(overview),
        attachment: (id: number) => 'attachment/' + id
      } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
    const fixture = TestBed.createComponent(ShoppingPageComponent);
    fixture.detectChanges();

    const tabs = Array.from(
      fixture.nativeElement.querySelectorAll('.shopping-tabs button') as NodeListOf<HTMLButtonElement>
    );
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Lista', 'Prodotti', 'Prezzi', 'Categorie', 'Supermercati'
    ]);

    tabs[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Prodotti (0)');

    tabs[3].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Dispensa');

    tabs[4].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Conad');
  });
});
