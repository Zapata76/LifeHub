import {
  ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { concat, Observable, of } from 'rxjs';
import { ModalBackdropDirective } from '../../shared/modal-backdrop.directive';
import { InventoryApiService } from './inventory-api.service';
import { InventoryItem, InventoryOverview, InventoryPayload } from './inventory.models';

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
  readonly hiddenOwners = signal<Set<number>>(new Set());
  readonly editorOpen = signal(false);
  readonly editing = signal(false);
  readonly imageFile = signal<File | null>(null);
  readonly imagePreview = signal<string | null>(null);
  readonly removeExistingImage = signal(false);
  readonly mobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl('Altro', { nonNullable: true }),
    location: new FormControl('', { nonNullable: true }),
    ownerId: new FormControl('', { nonNullable: true }),
    documentId: new FormControl('', { nonNullable: true }),
    quantity: new FormControl<number | null>(null, [Validators.min(0)]),
    unit: new FormControl('', { nonNullable: true }),
    purchaseDate: new FormControl('', { nonNullable: true }),
    warrantyExpiry: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true })
  });

  readonly filteredItems = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('it');
    const hidden = this.hiddenOwners();
    return (this.overview()?.items ?? []).filter((item) => {
      if (item.owner_id && hidden.has(Number(item.owner_id))) return false;
      if (!term) return true;
      return [item.name, item.category_text, item.location, item.notes, item.owner_name]
        .some((value) => (value ?? '').toLocaleLowerCase('it').includes(term));
    });
  });

  readonly canManage = computed(() => !!this.overview()?.can_manage);

  constructor() { this.load(); }

  load(selectId?: number, message = ''): void {
    this.loading.set(true);
    this.api.overview().subscribe({
      next: (overview) => {
        this.overview.set(overview); this.loading.set(false); this.busy.set(false); this.success.set(message);
        const id = selectId ?? this.selected()?.id ?? overview.items[0]?.id;
        if (id) this.select(id); else this.selected.set(null);
      },
      error: () => this.fail('Impossibile caricare l’inventario.')
    });
  }

  select(id: number): void {
    this.detailLoading.set(true); this.error.set('');
    this.api.detail(id).subscribe({
      next: (item) => { this.selected.set(item); this.detailLoading.set(false); },
      error: () => { this.detailLoading.set(false); this.error.set('Impossibile aprire l’oggetto.'); }
    });
  }

  toggleOwner(id: number): void {
    const next = new Set(this.hiddenOwners());
    next.has(id) ? next.delete(id) : next.add(id);
    this.hiddenOwners.set(next);
  }

  openCreate(): void {
    this.resetEditor(); this.editing.set(false); this.editorOpen.set(true);
  }

  openEdit(): void {
    const item = this.selected();
    if (!item?.can_edit) return;
    this.resetEditor(); this.editing.set(true);
    this.form.setValue({
      name: item.name, category: item.category_text ?? 'Altro', location: item.location ?? '',
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
      name: value.name.trim(), category: value.category.trim() || 'Altro', location: value.location.trim(),
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

  selectImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.revokePreview(); this.imageFile.set(file); this.imagePreview.set(URL.createObjectURL(file));
    this.removeExistingImage.set(false);
  }

  removePhoto(): void {
    this.revokePreview(); this.imageFile.set(null);
    this.removeExistingImage.set(!!(this.editing() && this.selected()?.image_attachment_id));
  }

  imageSource(item: InventoryItem | null): string | null {
    if (this.imagePreview()) return this.imagePreview();
    if (this.removeExistingImage() || !item?.image_attachment_id) return null;
    return this.api.attachment(item.image_attachment_id);
  }

  isExpired(date: string | null): boolean {
    return !!date && date < new Date().toISOString().slice(0, 10);
  }

  quantityLabel(item: InventoryItem): string {
    if (item.quantity === null) return 'Non indicata';
    return `${Number(item.quantity)}${item.unit_code ? ' ' + item.unit_code : ''}`;
  }

  setSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  ngOnDestroy(): void { this.revokePreview(); }

  private persistImage(id: number): void {
    const operations: Observable<void>[] = [];
    const uploadedImage = !!this.imageFile();
    if (this.removeExistingImage()) operations.push(this.api.removeImage(id));
    if (this.imageFile()) operations.push(this.api.uploadImage(id, this.imageFile()!));
    (operations.length ? concat(...operations) : of(undefined)).subscribe({
      complete: () => {
        this.editorOpen.set(false); this.resetEditor();
        this.load(id, uploadedImage ? 'Oggetto e foto salvati.' : 'Oggetto salvato.');
      },
      error: () => this.fail('Oggetto salvato, ma la foto non è stata aggiornata.')
    });
  }

  private resetEditor(): void {
    this.form.reset({ name: '', category: 'Altro', location: '', ownerId: '', documentId: '', quantity: null,
      unit: '', purchaseDate: '', warrantyExpiry: '', notes: '' });
    this.imageFile.set(null); this.removeExistingImage.set(false); this.revokePreview();
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
