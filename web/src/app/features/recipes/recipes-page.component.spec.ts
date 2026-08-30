import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RecipesPageComponent } from './recipes-page.component';

const recipe = {
  id: 7, title: 'Lasagna', description: 'Ricetta di famiglia', instructions: 'Cuocere al forno',
  category_text: 'Primo', prep_time_minutes: 90, servings: 4, difficulty: 'media' as const,
  created_by: 1, author_name: 'Emiliano', ingredient_count: 1, version: 1,
  image_attachment_id: null, can_edit: true,
  ingredients: [{
    id: 3, product_id: null, ingredient_name: 'Pasta fresca', quantity_raw: '500 g',
    position_no: 1, product_name: null, category_name: null
  }]
};

const catalogProduct = {
  id: 21, category_id: 3, name: 'Farina 00', category_name: 'Dispensa'
};

const overview = {
  recipes: [recipe], categories: ['Primo'], products: [catalogProduct],
  productCategories: [{ id: 3, name: 'Dispensa' }], members: [{ id: 1, username: 'Emiliano' }]
};

describe('RecipesPageComponent', () => {
  async function createFixture() {
    const get = vi.fn((url: string) => of(url.endsWith('/overview') ? overview : { item: recipe }));
    const post = vi.fn((url: string, body?: any) => of(
      url === 'api/v1/recipes' ? { id: 8 }
        : url === 'api/v1/products'
          ? { item: { id: 22, category_id: body.category_id, name: body.name, category_name: null } }
          : { updated: true }));
    const put = vi.fn(() => of({ updated: true }));
    await TestBed.configureTestingModule({
      imports: [RecipesPageComponent],
      providers: [{ provide: HttpClient, useValue: { get, post, put } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(RecipesPageComponent);
    fixture.detectChanges();
    return { fixture, post, put };
  }

  it('shows how many people the ingredient quantities cover', async () => {
    const { fixture } = await createFixture();
    expect(fixture.nativeElement.textContent).toContain('Ingredienti per 4 persone');
  });
  it('scrolls to a recipe selected from the list on mobile but not during automatic selection', async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === '(max-width: 720px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });
    try {
      const { fixture } = await createFixture();
      const detail = fixture.nativeElement.querySelector('.recipe-detail-panel') as HTMLElement;
      const scrollIntoView = vi.fn();
      Object.defineProperty(detail, 'scrollIntoView', { configurable: true, value: scrollIntoView });

      fixture.componentInstance.select(recipe.id);
      expect(scrollIntoView).not.toHaveBeenCalled();

      (fixture.nativeElement.querySelector('.recipe-list-item') as HTMLButtonElement).click();
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
    }
  });


  it('keeps the ingredient heading plain when servings are not specified', async () => {
    const { fixture } = await createFixture();
    fixture.componentInstance.selected.set({ ...recipe, servings: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ingredienti');
    expect(fixture.nativeElement.textContent).not.toContain('Ingredienti per');
  });

  it('creates a recipe with the selected number of people', async () => {
    const { fixture, post } = await createFixture();
    (fixture.nativeElement.querySelector('.recipe-page-heading .primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    fixture.componentInstance.form.patchValue({ title: 'Tiramisù', servings: 6 });
    fixture.componentInstance.save();
    expect(post).toHaveBeenCalledWith('api/v1/recipes', expect.objectContaining({
      title: 'Tiramisù', servings: 6
    }));
  });

  it('restores and updates servings when editing a recipe', async () => {
    const { fixture, put } = await createFixture();
    fixture.componentInstance.openEdit();
    expect(fixture.componentInstance.form.controls.servings.value).toBe(4);
    fixture.componentInstance.form.controls.servings.setValue(8);
    fixture.componentInstance.save();
    expect(put).toHaveBeenCalledWith('api/v1/recipes/7', expect.objectContaining({
      servings: 8, version: 1
    }));
  });

  it('adds an ingredient through the wizard and excludes an already used product', async () => {
    const { fixture } = await createFixture();
    fixture.componentInstance.openCreate();
    fixture.componentInstance.openIngredientWizard();
    fixture.componentInstance.selectIngredientProduct(catalogProduct);
    fixture.componentInstance.ingredientWizardForm.controls.quantity.setValue('500 g');
    fixture.componentInstance.confirmIngredient();

    expect(fixture.componentInstance.ingredients.length).toBe(1);
    expect(fixture.componentInstance.ingredients.at(0).getRawValue()).toEqual({
      productId: '21', name: 'Farina 00', quantity: '500 g'
    });

    fixture.componentInstance.openIngredientWizard();
    expect(fixture.componentInstance.wizardProducts().some((product) => product.id === 21)).toBe(false);
  });

  it('closes product options when focus moves to another wizard field', async () => {
    const { fixture } = await createFixture();
    fixture.componentInstance.openCreate();
    fixture.componentInstance.openIngredientWizard();
    fixture.detectChanges();

    const searchContainer = fixture.nativeElement.querySelector('.ingredient-wizard-product-search') as HTMLElement;
    const search = searchContainer.querySelector('input') as HTMLInputElement;
    const quantity = fixture.nativeElement.querySelector(
      '.ingredient-wizard-step input[formcontrolname="quantity"]'
    ) as HTMLInputElement;

    search.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.ingredientResultsOpen()).toBe(true);

    searchContainer.dispatchEvent(new FocusEvent('focusout', {
      bubbles: true, relatedTarget: quantity
    }));
    fixture.detectChanges();
    expect(fixture.componentInstance.ingredientResultsOpen()).toBe(false);
  });

  it('creates a missing product in the shared catalogue before adding it', async () => {
    const { fixture, post } = await createFixture();
    fixture.componentInstance.store.set({
      id: 1, householdId: 1, role: 'admin', username: 'Emiliano'
    }, 'csrf');
    fixture.componentInstance.openCreate();
    fixture.componentInstance.openIngredientWizard();
    fixture.componentInstance.searchWizardProducts('Zenzero');
    fixture.componentInstance.prepareProductCreation();
    fixture.componentInstance.ingredientWizardForm.patchValue({ categoryId: '3', quantity: 'q.b.' });
    fixture.componentInstance.confirmIngredient();

    expect(post).toHaveBeenCalledWith('api/v1/products', {
      name: 'Zenzero', category_id: 3
    });
    expect(fixture.componentInstance.ingredients.at(0).getRawValue()).toEqual({
      productId: '22', name: 'Zenzero', quantity: 'q.b.'
    });
  });
});
