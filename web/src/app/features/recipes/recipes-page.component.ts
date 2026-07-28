import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { concat, Observable, of } from 'rxjs';
import { RecipesApiService } from './recipes-api.service';
import {
  RecipeDetail, RecipeIngredientPayload, RecipePayload, RecipeProduct, RecipeSummary, RecipesOverview
} from './recipes.models';

type IngredientForm = FormGroup<{
  productId: FormControl<string>;
  productSearch: FormControl<string>;
  name: FormControl<string>;
  quantity: FormControl<string>;
}>;

@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './recipes-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipesPageComponent implements OnDestroy {
  readonly api = inject(RecipesApiService);
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
  readonly activeIngredient = signal<number | null>(null);
  readonly imageFile = signal<File | null>(null);
  readonly imagePreview = signal<string | null>(null);
  readonly removeExistingImage = signal(false);
  readonly webcamOpen = signal(false);
  readonly canUseWebcam = !!navigator.mediaDevices?.getUserMedia;
  readonly mobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  private stream: MediaStream | null = null;

  @ViewChild('webcamVideo') webcamVideo?: ElementRef<HTMLVideoElement>;

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl('', { nonNullable: true }),
    prepTimeMinutes: new FormControl<number | null>(null, [Validators.min(1), Validators.max(1440)]),
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

  select(id: number): void {
    this.detailLoading.set(true);
    this.error.set('');
    this.api.detail(id).subscribe({
      next: (recipe) => { this.selected.set(recipe); this.detailLoading.set(false); },
      error: () => { this.detailLoading.set(false); this.error.set('Impossibile aprire la ricetta.'); }
    });
  }

  toggleAuthor(id: number): void {
    const next = new Set(this.hiddenAuthors());
    next.has(id) ? next.delete(id) : next.add(id);
    this.hiddenAuthors.set(next);
  }

  openCreate(): void {
    this.resetEditor();
    this.ingredients.push(this.newIngredient());
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
    if (this.ingredients.length === 0) this.ingredients.push(this.newIngredient());
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    if (this.busy()) return;
    this.editorOpen.set(false);
    this.stopWebcam();
    this.resetEditor();
  }

  addIngredient(): void { this.ingredients.push(this.newIngredient()); }

  removeIngredient(index: number): void {
    this.ingredients.removeAt(index);
    if (this.ingredients.length === 0) this.addIngredient();
    this.activeIngredient.set(null);
  }

  searchIngredient(index: number, value: string): void {
    this.ingredients.at(index).controls.productSearch.setValue(value);
    this.activeIngredient.set(index);
  }

  productsFor(index: number): RecipeProduct[] {
    const term = this.ingredients.at(index).controls.productSearch.value.trim().toLocaleLowerCase('it');
    return (this.overview()?.products ?? []).filter((product) => !term
      || product.name.toLocaleLowerCase('it').includes(term)
      || (product.category_name ?? '').toLocaleLowerCase('it').includes(term)).slice(0, 80);
  }

  selectProduct(index: number, product: RecipeProduct): void {
    this.ingredients.at(index).patchValue({
      productId: String(product.id), productSearch: '', name: product.name
    });
    this.activeIngredient.set(null);
  }

  clearProduct(index: number): void {
    this.ingredients.at(index).patchValue({ productId: '', productSearch: '', name: '' });
    this.activeIngredient.set(null);
  }

  productLabel(index: number): string {
    const group = this.ingredients.at(index);
    if (group.controls.productSearch.value) return group.controls.productSearch.value;
    const product = this.overview()?.products.find((item) => item.id === Number(group.controls.productId.value));
    return product ? `${product.category_name ? product.category_name + ' · ' : ''}${product.name}` : '';
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
      difficulty: value.difficulty, ingredients,
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
      productSearch: new FormControl('', { nonNullable: true }),
      name: new FormControl(name, { nonNullable: true }),
      quantity: new FormControl(quantity, { nonNullable: true })
    });
  }

  private resetEditor(): void {
    this.form.reset({ title: '', category: '', prepTimeMinutes: null, difficulty: 'media', description: '', instructions: '' });
    this.ingredients.clear();
    this.activeIngredient.set(null);
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
