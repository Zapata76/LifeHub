import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { DocumentsApiService } from './documents-api.service';
import { DocumentItem, DocumentOverview, DocumentPayload } from './documents.models';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './documents-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentsPageComponent {
  readonly api = inject(DocumentsApiService);
  readonly overview = signal<DocumentOverview>({ documents: [], categories: [], can_manage: false });
  readonly selected = signal<DocumentItem | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly search = signal('');
  readonly category = signal('');
  readonly editorOpen = signal(false);
  readonly editing = signal(false);
  readonly selectedFile = signal<File | null>(null);
  readonly deleteTarget = signal<DocumentItem | null>(null);

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] }),
    category: new FormControl('Altro', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(20000)] })
  });

  readonly filteredDocuments = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('it');
    const category = this.category();
    return this.overview().documents.filter((document) => {
      if (category && document.category_text !== category) return false;
      if (!term) return true;
      return [document.title, document.category_text, document.description, document.owner_name]
        .some((value) => (value ?? '').toLocaleLowerCase('it').includes(term));
    });
  });

  constructor() { this.load(); }

  load(selectId?: number, message = ''): void {
    this.loading.set(true); this.error.set('');
    this.api.overview().subscribe({
      next: (overview) => {
        const normalized = {
          ...overview,
          documents: overview.documents.map((item) => ({
            ...item, id: Number(item.id), owner_id: Number(item.owner_id), version: Number(item.version),
            attachment_id: item.attachment_id === null ? null : Number(item.attachment_id),
            attachment_size: item.attachment_size === null ? null : Number(item.attachment_size)
          }))
        };
        this.overview.set(normalized); this.loading.set(false); this.busy.set(false); this.success.set(message);
        const id = selectId ?? this.selected()?.id ?? normalized.documents[0]?.id;
        this.selected.set(normalized.documents.find((item) => item.id === id) ?? normalized.documents[0] ?? null);
      },
      error: () => this.fail('Impossibile caricare l’archivio documenti.')
    });
  }

  select(document: DocumentItem): void { this.selected.set(document); this.error.set(''); }
  setSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  setCategory(event: Event): void { this.category.set((event.target as HTMLSelectElement).value); }

  openCreate(): void {
    this.editing.set(false); this.selectedFile.set(null);
    this.form.reset({ title: '', category: 'Altro', notes: '' });
    this.editorOpen.set(true); this.error.set(''); this.success.set('');
  }

  openEdit(): void {
    const document = this.selected();
    if (!document?.can_edit) return;
    this.editing.set(true); this.selectedFile.set(null);
    this.form.setValue({
      title: document.title, category: document.category_text || 'Altro', notes: document.description || ''
    });
    this.editorOpen.set(true); this.error.set(''); this.success.set('');
  }

  closeEditor(): void {
    if (!this.busy()) { this.editorOpen.set(false); this.selectedFile.set(null); }
  }

  selectFile(event: Event): void {
    this.selectedFile.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  save(): void {
    const current = this.selected();
    const file = this.selectedFile();
    if (this.form.invalid || this.busy() || (!this.editing() && !file)) return;
    const value = this.form.getRawValue();
    const payload: DocumentPayload = {
      title: value.title.trim(), category: value.category.trim() || 'Altro', notes: value.notes.trim(),
      ...(this.editing() && current ? { version: current.version } : {})
    };
    this.busy.set(true); this.error.set('');
    const request: Observable<number | void> = this.editing() && current
      ? this.api.update(current.id, payload, file)
      : this.api.create(payload, file!);
    request.subscribe({
      next: (createdId) => {
        const id = this.editing() && current ? current.id : Number(createdId);
        this.editorOpen.set(false); this.selectedFile.set(null);
        this.load(id, this.editing() ? 'Documento aggiornato.' : 'Documento aggiunto all’archivio.');
      },
      error: (error) => this.fail(this.message(error, 'Il documento non è stato salvato.'))
    });
  }

  confirmDelete(): void {
    const document = this.selected();
    if (document?.can_edit) this.deleteTarget.set(document);
  }

  deleteDocument(): void {
    const document = this.deleteTarget();
    if (!document || this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.api.delete(document.id, document.version).subscribe({
      next: () => {
        this.deleteTarget.set(null); this.selected.set(null);
        this.load(undefined, 'Documento e file eliminati definitivamente.');
      },
      error: (error) => this.fail(this.message(error, 'Il documento non è stato eliminato.'))
    });
  }

  formatDate(value: string): string {
    const date = value.slice(0, 10).split('-');
    return date.length === 3 ? `${date[2]}/${date[1]}/${date[0]}` : value;
  }

  formatSize(value: number | null): string {
    if (!value) return 'Dimensione non disponibile';
    if (value < 1024) return `${value} B`;
    if (value < 1048576) return `${(value / 1024).toFixed(1)} KiB`;
    return `${(value / 1048576).toFixed(1)} MiB`;
  }

  fileIcon(document: DocumentItem): string {
    if (document.attachment_mime === 'application/pdf') return '📕';
    if (document.attachment_mime?.startsWith('image/')) return '🖼️';
    return '📄';
  }

  private fail(message: string): void {
    this.error.set(message); this.busy.set(false); this.loading.set(false);
  }

  private message(error: any, fallback: string): string {
    return typeof error?.error?.error?.message === 'string' ? error.error.error.message : fallback;
  }
}
