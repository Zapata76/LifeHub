import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { concat, Observable, of } from 'rxjs';
import { SessionStore } from '../../core/session.store';
import { ModalBackdropDirective } from '../../shared/modal-backdrop.directive';
import { RecipesApiService } from './recipes-api.service';
import {
  RecipeDetail, RecipeIngredientPayload, RecipePayload, RecipeProduct, RecipeSummary, RecipesOverview
} from './recipes.models';

type IngredientForm = FormGroup<{
  productId: FormControl<string>;
  name: FormControl<string>;
  quantity: FormControl<string>;
}>;

type IngredientMode = 'search' | 'product' | 'free' | 'create';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ModalBackdropDirective],
  templateUrl: './recipes-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipesPageComponent implements OnDestroy {
  readonly api = inject(RecipesApiService);
  readonly store = inject(SessionStore);
  readonly overview = signal<RecipesOverview | null>(null);
  readonly selected = signal<RecipeDetail | null>(null);
  readonly loading = signal(true);
  readonly detailLoading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly search = signal('');
  readonly category = signal('');
  readonly hiddenAuthors = signal<Set<number>>(new Set());
  readonly editorOpen = signal(false);
  readonly editing = signal(false);
  readonly ingredientWizardOpen = signal(false);
  readonly ingredientWizardIndex = signal<number | null>(null);
  readonly ingredientMode = signal<IngredientMode>('search');
  readonly ingredientSearch = signal('');
  readonly ingredientProduct = signal<RecipeProduct | null>(null);
  readonly ingredientResultsOpen = signal(false);
  readonly highlightedIngredientIndex = signal(-1);
  readonly ingredientBusy = signal(false);
  readonly ingredientError = signal('');
  readonly canManageProducts = computed(() =>
    ['admin', 'adult'].includes(this.store.user()?.role ?? '')
  );
  readonly ingredientWizardForm = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    categoryId: new FormControl('', { nonNullable: true }),
    quantity: new FormControl('', { nonNullable: true })
  });
  readonly imageFile = signal<File | null>(null);
  readonly imagePreview = signal<string | null>(null);
  readonly removeExistingImage = signal(false);
  readonly webcamOpen = signal(false);
  readonly canUseWebcam = !!navigator.mediaDevices?.getUserMedia;
  readonly mobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  private stream: MediaStream | null = null;

  @ViewChild('webcamVideo') webcamVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('recipeDetail') recipeDetail?: ElementRef<HTMLElement>;

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl('', { nonNullable: true }),
    prepTimeMinutes: new FormControl<number | null>(null, [Validators.min(1), Validators.max(1440)]),
    servings: new FormControl<number | null>(null, [Validators.min(1), Validators.max(100)]),
    difficulty: new FormControl<'bassa' | 'media' | 'alta'>('media', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    instructions: new FormControl('', { nonNullable: true }),
    ingredients: new FormArray<IngredientForm>([])
  });

  readonly filteredRecipes = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('it');
    const category = this.category().toLocaleLowerCase('it');
    const hidden = this.hiddenAuthors();
    return (this.overview()?.recipes ?? []).filter((recipe) => {
      if (hidden.has(Number(recipe.created_by))) return false;
      if (category && (recipe.category_text ?? '').toLocaleLowerCase('it') !== category) return false;
      if (!term) return true;
      return [recipe.title, recipe.description, recipe.instructions, recipe.author_name]
        .some((value) => (value ?? '').toLocaleLowerCase('it').includes(term));
    });
  });


  constructor() { this.load(); }

  get ingredients(): FormArray<IngredientForm> { return this.form.controls.ingredients; }

  load(selectId?: number, message = ''): void {
    this.loading.set(true);
    this.api.overview().subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.loading.set(false);
        this.busy.set(false);
        this.success.set(message);
        const id = selectId ?? this.selected()?.id ?? overview.recipes[0]?.id;
        if (id) this.select(id); else this.selected.set(null);
      },
      error: () => this.fail('Impossibile caricare l’archivio ricette.')
    });
  }

  select(id: number, scrollToDetail = false): void {
    this.detailLoading.set(true);
    this.error.set('');
    this.api.detail(id).subscribe({
      next: (recipe) => {
        this.selected.set(recipe);
        this.detailLoading.set(false);
        if (scrollToDetail) this.scrollToDetailOnMobile();
      },
      error: () => { this.detailLoading.set(false); this.error.set('Impossibile aprire la ricetta.'); }
    });
  }

  private scrollToDetailOnMobile(): void {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 720px)').matches) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.recipeDetail?.nativeElement.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth', block: 'start'
    });
  }

  toggleAuthor(id: number): void {
    const next = new Set(this.hiddenAuthors());
    next.has(id) ? next.delete(id) : next.add(id);
    this.hiddenAuthors.set(next);
  }

  openCreate(): void {
    this.resetEditor();
    this.editing.set(false);
    this.editorOpen.set(true);
  }

  openEdit(): void {
    const recipe = this.selected();
    if (!recipe?.can_edit) return;
    this.resetEditor();
    this.editing.set(true);
    this.form.patchValue({
      title: recipe.title,
      category: recipe.category_text ?? '',
      prepTimeMinutes: recipe.prep_time_minutes ? Number(recipe.prep_time_minutes) : null,
      servings: recipe.servings ? Number(recipe.servings) : null,
      difficulty: recipe.difficulty ?? 'media',
      description: recipe.description ?? '',
      instructions: recipe.instructions ?? ''
    });
    for (const ingredient of recipe.ingredients) {
      this.ingredients.push(this.newIngredient(
        ingredient.product_id ? String(ingredient.product_id) : '',
        ingredient.ingredient_name,
        ingredient.quantity_raw ?? ''
      ));
    }
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    if (this.busy()) return;
    this.editorOpen.set(false);
    this.stopWebcam();
    this.resetEditor();
  }

  addIngredient(): void { this.openIngredientWizard(); }

  removeIngredient(index: number): void {
    this.ingredients.removeAt(index);
  }

  openIngredientWizard(index: number | null = null): void {
    this.resetIngredientWizard();
    this.ingredientWizardIndex.set(index);
    if (index !== null) {
      const ingredient = this.ingredients.at(index).getRawValue();
      const product = this.overview()?.products.find(
        (item) => item.id === Number(ingredient.productId)
      ) ?? null;
      const name = product?.name ?? ingredient.name;
      this.ingredientSearch.set(name);
      this.ingredientWizardForm.patchValue({
        search: name,
        quantity: ingredient.quantity
      });
      if (product) {
        this.ingredientProduct.set(product);
        this.ingredientMode.set('product');
      } else if (name) {
        this.ingredientMode.set('free');
      }
    }
    this.ingredientWizardOpen.set(true);
  }

  closeIngredientWizard(): void {
    if (this.ingredientBusy()) return;
    this.ingredientWizardOpen.set(false);
    this.resetIngredientWizard();
  }

  searchWizardProducts(value: string): void {
    this.ingredientWizardForm.controls.search.setValue(value);
    this.ingredientSearch.set(value);
    this.ingredientProduct.set(null);
    this.ingredientMode.set('search');
    this.ingredientError.set('');
    this.ingredientResultsOpen.set(true);
    this.highlightedIngredientIndex.set(this.wizardProducts().length ? 0 : -1);
  }

  openIngredientResults(): void {
    this.ingredientResultsOpen.set(true);
    this.highlightedIngredientIndex.set(this.wizardProducts().length ? 0 : -1);
  }

  closeIngredientResults(event: FocusEvent): void {
    const container = event.currentTarget as HTMLElement | null;
    const next = event.relatedTarget as Node | null;
    if (container && next && container.contains(next)) return;
    this.ingredientResultsOpen.set(false);
    this.highlightedIngredientIndex.set(-1);
  }

  wizardProducts(): RecipeProduct[] {
    const term = this.normalize(this.ingredientSearch());
    return (this.overview()?.products ?? [])
      .filter((product) => !this.productAlreadyAdded(product.id))
      .filter((product) => !term
        || this.normalize(product.name).includes(term)
        || this.normalize(product.category_name ?? '').includes(term))
      .slice(0, 80);
  }

  selectIngredientProduct(product: RecipeProduct): void {
    if (this.productAlreadyAdded(product.id)) {
      this.ingredientError.set('Questo prodotto \u00e8 gi\u00e0 presente nella ricetta.');
      return;
    }
    this.ingredientProduct.set(product);
    this.ingredientSearch.set(product.name);
    this.ingredientWizardForm.controls.search.setValue(product.name);
    this.ingredientMode.set('product');
    this.ingredientResultsOpen.set(false);
    this.highlightedIngredientIndex.set(-1);
    this.ingredientError.set('');
  }

  useFreeIngredient(): void {
    const name = this.ingredientSearch().trim();
    if (!name) {
      this.ingredientError.set("Scrivi il nome dell'ingrediente.");
      return;
    }
    const product = this.exactCatalogProduct(name);
    if (product) {
      this.selectIngredientProduct(product);
      return;
    }
    if (this.ingredientNameAlreadyAdded(name)) {
      this.ingredientError.set('Questo ingrediente \u00e8 gi\u00e0 presente nella ricetta.');
      return;
    }
    this.ingredientProduct.set(null);
    this.ingredientMode.set('free');
    this.ingredientResultsOpen.set(false);
    this.ingredientError.set('');
  }

  prepareProductCreation(): void {
    const name = this.ingredientSearch().trim();
    if (!name) {
      this.ingredientError.set('Indica il nome del nuovo prodotto.');
      return;
    }
    const product = this.exactCatalogProduct(name);
    if (product) {
      this.selectIngredientProduct(product);
      this.ingredientError.set('Il prodotto esiste gi\u00e0: \u00e8 stato selezionato.');
      return;
    }
    this.ingredientProduct.set(null);
    this.ingredientMode.set('create');
    this.ingredientResultsOpen.set(false);
    this.ingredientError.set('');
  }

  handleIngredientSearchKeydown(event: KeyboardEvent): void {
    const products = this.wizardProducts();
    if (event.key === 'Escape') {
      this.ingredientResultsOpen.set(false);
      this.highlightedIngredientIndex.set(-1);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
    if (!products.length) return;
    event.preventDefault();
    if (!this.ingredientResultsOpen()) this.ingredientResultsOpen.set(true);
    const current = this.highlightedIngredientIndex();
    if (event.key === 'ArrowDown') {
      this.highlightedIngredientIndex.set(current < products.length - 1 ? current + 1 : 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      this.highlightedIngredientIndex.set(current > 0 ? current - 1 : products.length - 1);
      return;
    }
    const selectedIndex = current >= 0 ? current : 0;
    this.selectIngredientProduct(products[selectedIndex]);
  }

  wizardCanSubmit(): boolean {
    if (this.ingredientBusy()) return false;
    const mode = this.ingredientMode();
    const product = this.ingredientProduct();
    if (mode === 'product') return !!product && !this.productAlreadyAdded(product.id);
    const name = this.ingredientSearch().trim();
    if (!name || this.ingredientNameAlreadyAdded(name)) return false;
    if (mode === 'create') return this.canManageProducts();
    return mode === 'free';
  }

  confirmIngredient(keepOpen = false): void {
    if (!this.wizardCanSubmit()) {
      if (!this.ingredientError()) {
        this.ingredientError.set('Completa la scelta dell\'ingrediente prima di continuare.');
      }
      return;
    }
    const quantity = this.ingredientWizardForm.controls.quantity.value.trim();
    const mode = this.ingredientMode();
    const product = this.ingredientProduct();
    if (mode === 'product' && product) {
      this.commitIngredient(product, product.name, quantity, keepOpen);
      return;
    }
    const name = this.ingredientSearch().trim();
    if (mode === 'free') {
      this.commitIngredient(null, name, quantity, keepOpen);
      return;
    }
    if (mode !== 'create') return;

    const rawCategoryId = this.ingredientWizardForm.controls.categoryId.value;
    const categoryId = rawCategoryId ? Number(rawCategoryId) : null;
    this.ingredientBusy.set(true);
    this.ingredientError.set('');
    this.api.createProduct(name, categoryId).subscribe({
      next: (created) => {
        const category = this.overview()?.productCategories.find((item) => item.id === categoryId);
        const productWithCategory: RecipeProduct = {
          ...created,
          category_id: created.category_id ?? categoryId,
          category_name: created.category_name ?? category?.name ?? null
        };
        this.overview.update((current) => current ? {
          ...current,
          products: [...current.products, productWithCategory]
            .sort((left, right) => left.name.localeCompare(right.name, 'it'))
        } : current);
        this.ingredientBusy.set(false);
        this.commitIngredient(productWithCategory, productWithCategory.name, quantity, keepOpen);
      },
      error: (error: any) => {
        this.ingredientBusy.set(false);
        this.ingredientError.set(this.message(
          error,
          'Il prodotto non \u00e8 stato creato. Controlla il nome e riprova.'
        ));
      }
    });
  }

  ingredientName(index: number): string {
    const ingredient = this.ingredients.at(index).getRawValue();
    const product = this.overview()?.products.find(
      (item) => item.id === Number(ingredient.productId)
    );
    return (product?.name ?? ingredient.name) || 'Ingrediente senza nome';
  }

  ingredientCategory(index: number): string {
    const ingredient = this.ingredients.at(index).getRawValue();
    const product = this.overview()?.products.find(
      (item) => item.id === Number(ingredient.productId)
    );
    return product
      ? product.category_name ?? 'Senza categoria'
      : 'Ingrediente libero';
  }

  save(): void {
    if (this.form.invalid) return;
    const current = this.selected();
    const value = this.form.getRawValue();
    const ingredients: RecipeIngredientPayload[] = value.ingredients
      .map((ingredient) => ({
        productId: ingredient.productId ? Number(ingredient.productId) : null,
        name: ingredient.name.trim(), quantity: ingredient.quantity.trim()
      }))
      .filter((ingredient) => ingredient.productId !== null || ingredient.name !== '');
    const payload: RecipePayload = {
      title: value.title.trim(), category: value.category.trim(), description: value.description.trim(),
      instructions: value.instructions.trim(), prepTimeMinutes: value.prepTimeMinutes,
      servings: value.servings, difficulty: value.difficulty, ingredients,
      ...(this.editing() && current ? { version: Number(current.version) } : {})
    };
    this.busy.set(true); this.error.set(''); this.success.set('');
    const request: Observable<number | void> = this.editing() && current
      ? this.api.update(current.id, payload)
      : this.api.create(payload);
    request.subscribe({
      next: (createdId: number | void) => {
        const id = this.editing() && current ? current.id : Number(createdId);
        this.persistImage(id);
      },
      error: (error: any) => this.fail(this.message(error, 'La ricetta non è stata salvata.'))
    });
  }

  archive(): void {
    const recipe = this.selected();
    if (!recipe?.can_edit || !confirm(`Archiviare “${recipe.title}”?`)) return;
    this.busy.set(true);
    this.api.archive(recipe.id, Number(recipe.version)).subscribe({
      next: () => { this.selected.set(null); this.load(undefined, 'Ricetta archiviata.'); },
      error: () => this.fail('La ricetta è cambiata: ricarica e riprova.')
    });
  }

  selectImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.setImage(file);
  }

  removePhoto(): void {
    this.revokePreview();
    this.imageFile.set(null);
    this.removeExistingImage.set(!!(this.editing() && this.selected()?.image_attachment_id));
  }

  async startWebcam(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      this.webcamOpen.set(true);
      setTimeout(() => {
        if (this.webcamVideo) this.webcamVideo.nativeElement.srcObject = this.stream;
      });
    } catch {
      this.error.set('Impossibile accedere alla webcam.');
    }
  }

  captureWebcam(): void {
    const video = this.webcamVideo?.nativeElement;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) this.setImage(new File([blob], 'foto-ricetta.jpg', { type: 'image/jpeg' }));
      this.stopWebcam();
    }, 'image/jpeg', .9);
  }

  stopWebcam(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.webcamOpen.set(false);
  }

  imageSource(recipe: RecipeSummary | null): string | null {
    if (this.imagePreview()) return this.imagePreview();
    if (this.removeExistingImage() || !recipe?.image_attachment_id) return null;
    return this.api.attachment(recipe.image_attachment_id);
  }

  useRecipePlaceholder(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (image.getAttribute('src') === 'icons/5a.png') return;
    image.src = 'icons/5a.png';
    image.closest('.recipe-hero')?.classList.add('placeholder');
  }

  setSearch(event: Event): void { this.search.set(this.value(event)); }
  setCategory(event: Event): void { this.category.set(this.value(event)); }
  value(event: Event): string { return (event.target as HTMLInputElement).value; }
  ngOnDestroy(): void { this.stopWebcam(); this.revokePreview(); }

  private commitIngredient(
    product: RecipeProduct | null,
    name: string,
    quantity: string,
    keepOpen: boolean
  ): void {
    const ingredient = this.newIngredient(
      product ? String(product.id) : '',
      name,
      quantity
    );
    const index = this.ingredientWizardIndex();
    if (index === null) {
      this.ingredients.push(ingredient);
    } else {
      this.ingredients.setControl(index, ingredient);
    }
    if (keepOpen) {
      this.resetIngredientWizard();
      this.ingredientWizardOpen.set(true);
      return;
    }
    this.closeIngredientWizard();
  }

  private resetIngredientWizard(): void {
    this.ingredientWizardForm.reset({
      search: '',
      categoryId: '',
      quantity: ''
    });
    this.ingredientWizardIndex.set(null);
    this.ingredientMode.set('search');
    this.ingredientSearch.set('');
    this.ingredientProduct.set(null);
    this.ingredientResultsOpen.set(false);
    this.highlightedIngredientIndex.set(-1);
    this.ingredientBusy.set(false);
    this.ingredientError.set('');
  }

  private productAlreadyAdded(productId: number): boolean {
    const editingIndex = this.ingredientWizardIndex();
    return this.ingredients.controls.some((ingredient, index) =>
      index !== editingIndex
      && Number(ingredient.controls.productId.value) === productId
    );
  }

  private ingredientNameAlreadyAdded(name: string): boolean {
    const editingIndex = this.ingredientWizardIndex();
    const normalizedName = this.normalize(name);
    return this.ingredients.controls.some((ingredient, index) =>
      index !== editingIndex
      && this.normalize(ingredient.controls.name.value) === normalizedName
    );
  }

  private exactCatalogProduct(name: string): RecipeProduct | null {
    const normalizedName = this.normalize(name);
    return this.overview()?.products.find(
      (product) => this.normalize(product.name) === normalizedName
    ) ?? null;
  }

  private normalize(value: string): string {
    return value.trim().toLocaleLowerCase('it');
  }

  private persistImage(id: number): void {
    const operations: Observable<void>[] = [];
    const uploadedImage = !!this.imageFile();
    if (this.removeExistingImage()) operations.push(this.api.removeImage(id));
    if (this.imageFile()) operations.push(this.api.uploadImage(id, this.imageFile()!));
    const request = operations.length ? concat(...operations) : of(undefined);
    request.subscribe({
      complete: () => {
        this.editorOpen.set(false); this.resetEditor();
        this.load(id, uploadedImage ? 'Ricetta e foto salvate.' : 'Ricetta salvata.');
      },
      error: () => this.fail('Ricetta salvata, ma la foto non è stata aggiornata.')
    });
  }

  private newIngredient(productId = '', name = '', quantity = ''): IngredientForm {
    return new FormGroup({
      productId: new FormControl(productId, { nonNullable: true }),
      name: new FormControl(name, { nonNullable: true }),
      quantity: new FormControl(quantity, { nonNullable: true })
    });
  }

  private resetEditor(): void {
    this.form.reset({
      title: '', category: '', prepTimeMinutes: null, servings: null,
      difficulty: 'media', description: '', instructions: ''
    });
    this.ingredients.clear();
    this.ingredientWizardOpen.set(false);
    this.resetIngredientWizard();
    this.imageFile.set(null);
    this.removeExistingImage.set(false);
    this.revokePreview();
  }

  private setImage(file: File): void {
    this.revokePreview();
    this.imageFile.set(file);
    this.imagePreview.set(URL.createObjectURL(file));
    this.removeExistingImage.set(false);
  }

  private revokePreview(): void {
    const preview = this.imagePreview();
    if (preview) URL.revokeObjectURL(preview);
    this.imagePreview.set(null);
  }

  private fail(message: string): void { this.error.set(message); this.busy.set(false); this.loading.set(false); }
  private message(error: any, fallback: string): string {
    return typeof error?.error?.message === 'string' ? error.error.message : fallback;
  }
}
