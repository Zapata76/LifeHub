import {
  ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { concat, Observable, of } from 'rxjs';
import { ModalBackdropDirective } from '../../shared/modal-backdrop.directive';
import { InventoryApiService } from './inventory-api.service';
import { InventoryCategory, InventoryImage, InventoryItem, InventoryOverview, InventoryPayload } from './inventory.models';

interface PendingInventoryImage {
  file: File;
  url: string;
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ModalBackdropDirective],
  templateUrl: './inventory-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InventoryPageComponent implements OnDestroy {
  readonly api = inject(InventoryApiService);
  readonly overview = signal<InventoryOverview | null>(null);
  readonly selected = signal<InventoryItem | null>(null);
  readonly loading = signal(true);
  readonly detailLoading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly search = signal('');
  readonly showArchived = signal(false);
  readonly showCategories = signal(false);
  readonly categoryFilter = signal('');
  readonly hiddenOwners = signal<Set<number>>(new Set());
  readonly editorOpen = signal(false);
  readonly editing = signal(false);
  readonly deleteConfirmationOpen = signal(false);
  readonly categoryEditorOpen = signal(false);
  readonly editingCategory = signal<InventoryCategory | null>(null);
  readonly categoryDeleteTarget = signal<InventoryCategory | null>(null);
  readonly pendingImages = signal<PendingInventoryImage[]>([]);
  readonly selectedImageId = signal<number | null>(null);
  readonly maxImages = 10;
  readonly mobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    categoryId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    location: new FormControl('', { nonNullable: true }),
    ownerId: new FormControl('', { nonNullable: true }),
    documentId: new FormControl('', { nonNullable: true }),
    quantity: new FormControl<number | null>(null, [Validators.min(0)]),
    unit: new FormControl('', { nonNullable: true }),
    purchaseDate: new FormControl('', { nonNullable: true }),
    warrantyExpiry: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true })
  });

  readonly categoryForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });
  readonly filteredItems = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('it');
    const hidden = this.hiddenOwners();
    return (this.overview()?.items ?? []).filter((item) => {
      if (item.owner_id && hidden.has(Number(item.owner_id))) return false;
      if (!term) return true;
      return [item.name, item.category_name, item.location, item.notes, item.owner_name]
        .some((value) => (value ?? '').toLocaleLowerCase('it').includes(term));
    });
  });

  readonly filteredCategories = computed(() => {
    const term = this.categoryFilter().trim().toLocaleLowerCase('it');
    return (this.overview()?.categories ?? [])
      .filter((category) => !term || category.name.toLocaleLowerCase('it').includes(term));
  });
  readonly canManage = computed(() => !!this.overview()?.can_manage);

  readonly currentImage = computed(() => {
    const item = this.selected();
    const images = item?.images ?? [];
    if (images.length === 0) return null;
    const chosen = images.find((image) => image.id === this.selectedImageId());
    return chosen ?? images[images.length - 1];
  });

  constructor() { this.load(); }

  load(selectId?: number, message = '', errorMessage = ''): void {
    this.loading.set(true);
    this.api.overview(this.showArchived()).subscribe({
      next: (overview) => {
        this.overview.set(overview); this.loading.set(false); this.busy.set(false); this.success.set(message);
        this.error.set(errorMessage);
        if (this.showCategories()) {
          this.selected.set(null);
          return;
        }
        const id = selectId ?? this.selected()?.id ?? overview.items[0]?.id;
        if (id) this.select(id, errorMessage !== ''); else this.selected.set(null);
      },
      error: () => this.fail('Impossibile caricare l’inventario.')
    });
  }

  select(id: number, preserveError = false): void {
    this.detailLoading.set(true);
    if (!preserveError) this.error.set('');
    this.api.detail(id).subscribe({
      next: (item) => {
        this.selected.set(item);
        this.selectedImageId.set(item.image_attachment_id);
        this.detailLoading.set(false);
      },
      error: () => { this.detailLoading.set(false); this.error.set('Impossibile aprire l’oggetto.'); }
    });
  }

  setArchiveView(archived: boolean): void {
    if (this.busy() || (!this.showCategories() && this.showArchived() === archived)) return;
    this.showCategories.set(false);
    this.showArchived.set(archived);
    this.selected.set(null);
    this.selectedImageId.set(null);
    this.load();
  }

  setCategoryView(): void {
    if (this.busy() || this.showCategories()) return;
    this.showCategories.set(true);
    this.showArchived.set(false);
    this.selected.set(null);
    this.selectedImageId.set(null);
    this.load();
  }

  toggleOwner(id: number): void {
    const next = new Set(this.hiddenOwners());
    next.has(id) ? next.delete(id) : next.add(id);
    this.hiddenOwners.set(next);
  }

  openCreate(): void {
    if (!this.showArchived() && !this.showCategories()) {
      this.resetEditor(); this.editing.set(false); this.editorOpen.set(true);
    }
  }

  openEdit(): void {
    const item = this.selected();
    if (!item?.can_edit || this.showArchived() || this.showCategories()) return;
    this.resetEditor(); this.editing.set(true);
    this.form.setValue({
      name: item.name, categoryId: String(item.category_id), location: item.location ?? '',
      ownerId: item.owner_id ? String(item.owner_id) : '',
      documentId: item.document_id ? String(item.document_id) : '',
      quantity: item.quantity === null ? null : Number(item.quantity), unit: item.unit_code ?? '',
      purchaseDate: item.purchase_date ?? '', warrantyExpiry: item.warranty_expiry ?? '', notes: item.notes ?? ''
    });
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    if (this.busy()) return;
    this.editorOpen.set(false); this.resetEditor();
  }

  save(): void {
    if (this.form.invalid) return;
    const current = this.selected();
    const value = this.form.getRawValue();
    const payload: InventoryPayload = {
      name: value.name.trim(), categoryId: Number(value.categoryId), location: value.location.trim(),
      ownerId: value.ownerId ? Number(value.ownerId) : null,
      documentId: value.documentId ? Number(value.documentId) : null,
      quantity: value.quantity, unit: value.unit.trim(), purchaseDate: value.purchaseDate,
      warrantyExpiry: value.warrantyExpiry, notes: value.notes.trim(),
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
      error: (error: any) => this.fail(this.message(error, 'L’oggetto non è stato salvato.'))
    });
  }

  archive(): void {
    const item = this.selected();
    if (!item?.can_edit || !confirm(`Archiviare “${item.name}”?`)) return;
    this.busy.set(true);
    this.api.archive(item.id, Number(item.version)).subscribe({
      next: () => { this.selected.set(null); this.load(undefined, 'Oggetto archiviato.'); },
      error: () => this.fail('L’oggetto è cambiato: ricarica e riprova.')
    });
  }

  restore(): void {
    const item = this.selected();
    if (!item?.can_edit || !this.showArchived() || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.success.set('');
    this.api.restore(item.id, Number(item.version)).subscribe({
      next: () => {
        this.selected.set(null);
        this.load(undefined, 'Oggetto ripristinato.');
      },
      error: (error: any) => this.fail(this.message(error, 'L’oggetto non è stato ripristinato.'))
    });
  }

  openPermanentDelete(): void {
    const item = this.selected();
    if (!item?.can_edit || this.busy()) return;
    this.deleteConfirmationOpen.set(true);
  }

  closePermanentDelete(): void {
    if (!this.busy()) this.deleteConfirmationOpen.set(false);
  }

  deletePermanently(): void {
    const item = this.selected();
    if (!item?.can_edit || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.success.set('');
    this.api.deleteItem(item.id, Number(item.version)).subscribe({
      next: () => {
        this.deleteConfirmationOpen.set(false);
        this.selected.set(null);
        this.selectedImageId.set(null);
        this.load(undefined, 'Oggetto eliminato definitivamente.');
      },
      error: (error: any) => this.fail(this.message(error, 'L’oggetto non è stato eliminato.'))
    });
  }
  selectImages(event: Event): void {
    const input = event.target as HTMLInputElement;
    const candidates = Array.from(input.files ?? []);
    input.value = '';
    if (candidates.length === 0) return;


    const valid = candidates.filter((file) =>
      ['image/jpeg', 'image/png'].includes(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024
    );
    if (valid.length !== candidates.length) {
      this.error.set('Sono ammesse solo immagini JPEG o PNG fino a 10 MiB ciascuna.');
    }
    const available = Math.max(0, this.maxImages - this.imageSlotsUsed());
    if (valid.length > available) {
      this.error.set(`Puoi associare al massimo ${this.maxImages} immagini a un oggetto.`);
    }
    const accepted = valid.slice(0, available).map((file) => ({ file, url: URL.createObjectURL(file) }));
    if (accepted.length > 0) {
      this.pendingImages.update((images) => [...images, ...accepted]);
      this.form.markAsDirty();
    }
  }

  removePendingImage(index: number): void {
    const images = [...this.pendingImages()];
    const removed = images.splice(index, 1)[0];
    if (removed) URL.revokeObjectURL(removed.url);
    this.pendingImages.set(images);
    this.form.markAsDirty();
  }

  chooseImage(id: number): void {
    this.selectedImageId.set(id);
  }

  deleteImage(image: InventoryImage): void {
    const item = this.selected();
    if (!item?.can_edit || this.showArchived() || this.busy()) return;
    const last = (item.images ?? []).length === 1;
    const prompt = last
      ? 'Eliminare questa foto? L’oggetto resterà senza immagini.'
      : 'Eliminare questa foto dall’oggetto?';
    if (!confirm(prompt)) return;
    this.busy.set(true); this.error.set(''); this.success.set('');
    this.api.deleteImage(item.id, image.id, Number(item.version)).subscribe({
      next: () => {
        this.selectedImageId.set(null);
        this.load(item.id, 'Foto eliminata.');
      },
      error: (error: any) => this.fail(this.message(error, 'La foto non è stata eliminata.'))
    });
  }

  imageSlotsUsed(): number {
    const existing = this.editing() ? (this.selected()?.images ?? []).length : 0;
    return existing + this.pendingImages().length;
  }

  openCategoryCreate(): void {
    this.editingCategory.set(null);
    this.categoryForm.reset({ name: '' });
    this.categoryEditorOpen.set(true);
  }

  openCategoryRename(category: InventoryCategory): void {
    if (Number(category.is_fallback) === 1) return;
    this.editingCategory.set(category);
    this.categoryForm.setValue({ name: category.name });
    this.categoryEditorOpen.set(true);
  }

  closeCategoryEditor(): void {
    if (this.busy()) return;
    this.categoryEditorOpen.set(false);
    this.editingCategory.set(null);
    this.categoryForm.reset({ name: '' });
  }

  saveCategory(): void {
    if (this.categoryForm.invalid || this.busy()) return;
    const category = this.editingCategory();
    const name = this.categoryForm.controls.name.value.trim();
    this.busy.set(true); this.error.set(''); this.success.set('');
    const request: Observable<number | void> = category
      ? this.api.updateCategory(category.id, Number(category.version), name)
      : this.api.createCategory(name);
    request.subscribe({
      next: () => {
        this.categoryEditorOpen.set(false);
        this.editingCategory.set(null);
        this.categoryForm.reset({ name: '' });
        this.load(undefined, category ? 'Categoria rinominata.' : 'Categoria aggiunta.');
      },
      error: (error: any) => this.fail(this.message(error, 'La categoria non è stata salvata.'))
    });
  }

  requestCategoryDelete(category: InventoryCategory): void {
    if (Number(category.is_fallback) === 1 || this.busy()) return;
    this.categoryDeleteTarget.set(category);
  }

  closeCategoryDelete(): void {
    if (!this.busy()) this.categoryDeleteTarget.set(null);
  }

  confirmCategoryDelete(): void {
    const category = this.categoryDeleteTarget();
    if (!category || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.success.set('');
    this.api.deleteCategory(category.id, Number(category.version)).subscribe({
      next: (movedItems) => {
        this.categoryDeleteTarget.set(null);
        const message = movedItems === 1
          ? 'Categoria eliminata. 1 oggetto è stato spostato in Altro.'
          : `Categoria eliminata. ${movedItems} oggetti sono stati spostati in Altro.`;
        this.load(undefined, message);
      },
      error: (error: any) => this.fail(this.message(error, 'La categoria non è stata eliminata.'))
    });
  }

  categoryTotal(category: InventoryCategory): number {
    return Number(category.active_count) + Number(category.archived_count);
  }

  isExpired(date: string | null): boolean {
    return !!date && date < new Date().toISOString().slice(0, 10);
  }

  quantityLabel(item: InventoryItem): string {
    if (item.quantity === null) return 'Non indicata';
    return `${Number(item.quantity)}${item.unit_code ? ' ' + item.unit_code : ''}`;
  }

  setSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  setCategoryFilter(event: Event): void { this.categoryFilter.set((event.target as HTMLInputElement).value); }
  ngOnDestroy(): void { this.revokePreviews(); }

  private persistImage(id: number): void {
    const files = this.pendingImages().map(({ file }) => file);
    const operations = files.map((file) => this.api.uploadImage(id, file));
    (operations.length ? concat(...operations) : of(undefined)).subscribe({
      complete: () => {
        this.editorOpen.set(false); this.resetEditor();
        this.load(id, files.length > 0 ? 'Oggetto e foto salvati.' : 'Oggetto salvato.');
      },
      error: () => {
        this.editorOpen.set(false); this.resetEditor();
        this.load(id, '', 'Oggetto salvato, ma non tutte le foto sono state caricate.');
      }
    });
  }

  private resetEditor(): void {
    this.form.reset({ name: '', categoryId: this.fallbackCategoryId(), location: '', ownerId: '', documentId: '', quantity: null,
      unit: '', purchaseDate: '', warrantyExpiry: '', notes: '' });
    this.revokePreviews();
  }

  private revokePreviews(): void {
    this.pendingImages().forEach(({ url }) => URL.revokeObjectURL(url));
    this.pendingImages.set([]);
  }


  private fallbackCategoryId(): string {
    const fallback = (this.overview()?.categories ?? []).find((category) => Number(category.is_fallback) === 1);
    return fallback ? String(fallback.id) : '';
  }
  private fail(message: string): void { this.error.set(message); this.busy.set(false); this.loading.set(false); }
  private message(error: any, fallback: string): string {
    return typeof error?.error?.message === 'string' ? error.error.message : fallback;
  }
}
