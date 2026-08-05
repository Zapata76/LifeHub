import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { ModalBackdropDirective } from '../../shared/modal-backdrop.directive';
import { MealsApiService } from './meals-api.service';
import { MealPayload, MealRecipe, MealsOverview, MealType, PlannedMeal, ShoppingPreview } from './meals.models';

interface PlannerDay { date: string; dateValue: Date; }

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ModalBackdropDirective],
  templateUrl: './meals-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MealsPageComponent {
  readonly api = inject(MealsApiService);
  readonly overview = signal<MealsOverview | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly startDate = signal(this.mondayOf(new Date()));
  readonly rangeDays = signal<7 | 14>(7);
  readonly view = signal<'week' | 'day'>('week');
  readonly selectedDay = signal(this.localDate(new Date()));
  readonly editorOpen = signal(false);
  readonly editing = signal<PlannedMeal | null>(null);
  readonly selectedRecipeIds = signal<number[]>([]);
  readonly recipeSearch = signal('');
  readonly deleteConfirm = signal(false);
  readonly previewOpen = signal(false);
  readonly preview = signal<ShoppingPreview | null>(null);
  readonly selectedMealIds = signal<number[]>([]);

  readonly mealTypes: Array<{ value: MealType; label: string; icon: string }> = [
    { value: 'breakfast', label: 'Colazione', icon: '☕' },
    { value: 'lunch', label: 'Pranzo', icon: '☀️' },
    { value: 'dinner', label: 'Cena', icon: '🌙' }
  ];

  readonly form = new FormGroup({
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    type: new FormControl<MealType>('lunch', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    servings: new FormControl<number | null>(null, [Validators.min(1), Validators.max(100)]),
    notes: new FormControl('', { nonNullable: true })
  });

  readonly days = computed<PlannerDay[]>(() => Array.from({ length: this.rangeDays() }, (_, index) => {
    const value = this.addDays(this.parseDate(this.startDate()), index);
    return { date: this.localDate(value), dateValue: value };
  }));
  readonly visibleDays = computed(() => this.view() === 'day'
    ? this.days().filter((day) => day.date === this.selectedDay())
    : this.days());
  readonly periodLabel = computed(() => {
    const days = this.days();
    if (!days.length) return '';
    const formatter = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${formatter.format(days[0].dateValue)} — ${formatter.format(days[days.length - 1].dateValue)}`;
  });
  readonly filteredRecipes = computed(() => {
    const term = this.recipeSearch().trim().toLocaleLowerCase('it');
    return (this.overview()?.recipes ?? []).filter((recipe) => !term
      || recipe.title.toLocaleLowerCase('it').includes(term)
      || (recipe.category_text ?? '').toLocaleLowerCase('it').includes(term));
  });

  constructor() { this.load(); }

  load(message = ''): void {
    const start = this.startDate();
    const end = this.localDate(this.addDays(this.parseDate(start), this.rangeDays() - 1));
    this.loading.set(true); this.error.set('');
    this.api.overview(start, end).subscribe({
      next: (overview) => {
        this.overview.set(overview); this.loading.set(false); this.busy.set(false); this.success.set(message);
        this.selectedMealIds.set(overview.meals.map((meal) => meal.id));
      },
      error: (error) => this.fail(this.message(error, 'Impossibile caricare il piano pasti.'))
    });
  }

  meal(date: string, type: MealType): PlannedMeal | null {
    return this.overview()?.meals.find((meal) => meal.meal_date === date && meal.meal_type === type) ?? null;
  }

  movePeriod(direction: -1 | 1): void {
    if (this.view() === 'day') {
      const next = this.addDays(this.parseDate(this.selectedDay()), direction);
      const start = this.parseDate(this.startDate());
      const end = this.addDays(start, this.rangeDays() - 1);
      if (next < start || next > end) this.startDate.set(this.mondayOf(next));
      this.selectedDay.set(this.localDate(next));
    } else {
      this.startDate.set(this.localDate(this.addDays(this.parseDate(this.startDate()), direction * this.rangeDays())));
      this.selectedDay.set(this.startDate());
    }
    this.load();
  }

  today(): void {
    const now = new Date(); this.startDate.set(this.mondayOf(now)); this.selectedDay.set(this.localDate(now)); this.load();
  }

  chooseWeek(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    this.startDate.set(this.mondayOf(this.parseDate(value))); this.selectedDay.set(value); this.load();
  }

  setRange(days: 7 | 14): void { this.rangeDays.set(days); this.selectedDay.set(this.startDate()); this.load(); }
  setView(view: 'week' | 'day'): void { this.view.set(view); if (view === 'day' && !this.days().some((d) => d.date === this.selectedDay())) this.selectedDay.set(this.startDate()); }
  chooseDay(date: string): void { this.selectedDay.set(date); }

  openCreate(date: string, type: MealType): void {
    this.error.set(''); this.success.set('');
    this.editing.set(null); this.form.reset({ date, type, description: '', servings: null, notes: '' });
    this.selectedRecipeIds.set([]); this.recipeSearch.set(''); this.deleteConfirm.set(false); this.editorOpen.set(true);
  }

  openEdit(meal: PlannedMeal): void {
    this.error.set(''); this.success.set('');
    this.editing.set(meal);
    this.form.reset({
      date: meal.meal_date, type: meal.meal_type, description: meal.description ?? '',
      servings: meal.servings ? Number(meal.servings) : null, notes: meal.notes ?? ''
    });
    this.selectedRecipeIds.set(meal.recipes.map((recipe) => recipe.id));
    this.recipeSearch.set(''); this.deleteConfirm.set(false); this.editorOpen.set(true);
  }

  closeEditor(): void { if (!this.busy()) { this.editorOpen.set(false); this.deleteConfirm.set(false); } }
  setRecipeSearch(event: Event): void { this.recipeSearch.set((event.target as HTMLInputElement).value); }
  hasRecipe(id: number): boolean { return this.selectedRecipeIds().includes(id); }
  toggleRecipe(id: number): void {
    const ids = this.selectedRecipeIds();
    this.selectedRecipeIds.set(ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  }
  selectedRecipes(): MealRecipe[] {
    const ids = this.selectedRecipeIds(); return (this.overview()?.recipes ?? []).filter((recipe) => ids.includes(recipe.id));
  }

  save(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue(); const current = this.editing();
    const payload: MealPayload = {
      date: raw.date, type: raw.type, description: raw.description.trim(), notes: raw.notes.trim(),
      servings: raw.servings, recipeIds: this.selectedRecipeIds(), ...(current ? { version: Number(current.version) } : {})
    };
    if (!payload.description && !payload.recipeIds.length) {
      this.error.set('Inserisci una descrizione oppure seleziona almeno una ricetta.'); return;
    }
    this.busy.set(true); this.error.set(''); this.success.set('');
    const request: Observable<number | void> = current ? this.api.update(current.id, payload) : this.api.create(payload);
    request.subscribe({
      next: () => { this.editorOpen.set(false); this.load(current ? 'Pasto aggiornato.' : 'Pasto pianificato.'); },
      error: (error: any) => this.fail(this.message(error, 'Il pasto non è stato salvato.'))
    });
  }

  remove(): void {
    const current = this.editing(); if (!current) return;
    this.busy.set(true); this.error.set('');
    this.api.delete(current.id, Number(current.version)).subscribe({
      next: () => { this.editorOpen.set(false); this.deleteConfirm.set(false); this.load('Pasto rimosso dal piano.'); },
      error: (error) => this.fail(this.message(error, 'Il pasto non è stato rimosso.'))
    });
  }

  toggleMealSelection(id: number): void {
    const ids = this.selectedMealIds(); this.selectedMealIds.set(ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  }
  mealSelected(id: number): boolean { return this.selectedMealIds().includes(id); }

  openShoppingPreview(): void {
    const ids = this.selectedMealIds();
    if (!ids.length) { this.error.set('Seleziona almeno un pasto da convertire in spesa.'); return; }
    this.busy.set(true); this.error.set('');
    this.api.shoppingPreview(ids).subscribe({
      next: (preview) => { this.preview.set(preview); this.previewOpen.set(true); this.busy.set(false); },
      error: (error) => this.fail(this.message(error, 'Impossibile preparare l’anteprima della spesa.'))
    });
  }
  closePreview(): void { if (!this.busy()) { this.previewOpen.set(false); this.preview.set(null); } }
  generateShopping(): void {
    const listId = this.overview()?.primaryListId; const preview = this.preview();
    if (!listId || !preview || !preview.items.length) return;
    this.busy.set(true); this.error.set('');
    this.api.generateShopping(listId, preview.mealIds).subscribe({
      next: (result) => {
        this.previewOpen.set(false); this.preview.set(null);
        this.load(`${result.createdItems} articoli aggiunti alla lista della spesa.`);
      },
      error: (error) => this.fail(this.message(error, 'La lista della spesa non è stata aggiornata.'))
    });
  }

  dayName(day: PlannerDay): string { return new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(day.dateValue); }
  dayNumber(day: PlannerDay): string { return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(day.dateValue); }
  isToday(date: string): boolean { return date === this.localDate(new Date()); }
  typeLabel(type: MealType): string { return this.mealTypes.find((item) => item.value === type)?.label ?? type; }
  recipeImage(recipe: MealRecipe): string { return recipe.image_attachment_id ? this.api.attachment(recipe.image_attachment_id) : 'icons/5a.png'; }

  private mondayOf(date: Date): string {
    const value = new Date(date.getFullYear(), date.getMonth(), date.getDate()); const day = value.getDay() || 7;
    value.setDate(value.getDate() - day + 1); return this.localDate(value);
  }
  private parseDate(value: string): Date { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); }
  private addDays(date: Date, days: number): Date { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days); }
  private localDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  private fail(message: string): void { this.error.set(message); this.busy.set(false); this.loading.set(false); }
  private message(error: any, fallback: string): string { return typeof error?.error?.message === 'string' ? error.error.message : fallback; }
}
