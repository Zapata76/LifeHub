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

const overview = {
  recipes: [recipe], categories: ['Primo'], products: [], members: [{ id: 1, username: 'Emiliano' }]
};

describe('RecipesPageComponent', () => {
  async function createFixture() {
    const get = vi.fn((url: string) => of(url.endsWith('/overview') ? overview : { item: recipe }));
    const post = vi.fn((url: string) => of(url === 'api/v1/recipes' ? { id: 8 } : { updated: true }));
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
});
