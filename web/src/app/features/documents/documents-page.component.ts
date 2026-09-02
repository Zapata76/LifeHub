import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable } from 'rxjs';
import { apiErrorMessage } from '../../shared/api-error';
import { ModalBackdropDirective } from '../../shared/modal-backdrop.directive';
import { DocumentsApiService } from './documents-api.service';
import { DocumentAttachment, DocumentItem, DocumentOverview, DocumentPayload } from './documents.models';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ModalBackdropDirective],
  templateUrl: './documents-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentsPageComponent {
  readonly api = inject(DocumentsApiService);
  private readonly sanitizer = inject(DomSanitizer);
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
  readonly selectedFiles = signal<File[]>([]);
  readonly deleteTarget = signal<DocumentItem | null>(null);
  readonly attachmentDeleteTarget = signal<DocumentAttachment | null>(null);
  readonly previewTarget = signal<DocumentAttachment | null>(null);
  readonly previewPdfUrl = computed<SafeResourceUrl | null>(() => {
    const attachment = this.previewTarget();
    return attachment?.mime === 'application/pdf'
      ? this.sanitizer.bypassSecurityTrustResourceUrl(this.api.attachment(attachment.id, true))
      : null;
  });

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
          documents: overview.documents.map((item) => {
            const attachments = (item.attachments ?? []).map((attachment) => ({
              ...attachment,
              id: Number(attachment.id),
              size: Number(attachment.size)
            }));
            if (attachments.length === 0 && item.attachment_id !== null) {
              attachments.push({
                id: Number(item.attachment_id),
                name: item.attachment_name ?? 'File',
                mime: item.attachment_mime ?? 'application/octet-stream',
                size: Number(item.attachment_size ?? 0)
              });
            }
            return {
              ...item, id: Number(item.id), owner_id: Number(item.owner_id), version: Number(item.version),
              attachments,
              attachment_id: item.attachment_id === null ? null : Number(item.attachment_id),
              attachment_size: item.attachment_size === null ? null : Number(item.attachment_size)
            };
          })
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
    this.editing.set(false); this.selectedFiles.set([]);
    this.form.reset({ title: '', category: 'Altro', notes: '' });
    this.editorOpen.set(true); this.error.set(''); this.success.set('');
  }

  openEdit(): void {
    const document = this.selected();
    if (!document?.can_edit) return;
    this.editing.set(true); this.selectedFiles.set([]);
    this.form.setValue({
      title: document.title, category: document.category_text || 'Altro', notes: document.description || ''
    });
    this.editorOpen.set(true); this.error.set(''); this.success.set('');
  }

  closeEditor(): void {
    if (!this.busy()) { this.editorOpen.set(false); this.selectedFiles.set([]); }
  }

  selectFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const existing = this.editing() ? (this.selected()?.attachments.length ?? 0) : 0;
    if (existing + files.length > 10) {
      this.selectedFiles.set([]);
      input.value = '';
      this.error.set(`Puoi associare al massimo 10 file. Sono già presenti ${existing} file.`);
      return;
    }
    this.error.set('');
    this.selectedFiles.set(files);
  }

  save(): void {
    const current = this.selected();
    const files = this.selectedFiles();
    if (this.form.invalid || this.busy() || (!this.editing() && files.length === 0)) return;
    const value = this.form.getRawValue();
    const payload: DocumentPayload = {
      title: value.title.trim(), category: value.category.trim() || 'Altro', notes: value.notes.trim(),
      ...(this.editing() && current ? { version: current.version } : {})
    };
    this.busy.set(true); this.error.set('');
    const request: Observable<number | void> = this.editing() && current
      ? this.api.update(current.id, payload, files)
      : this.api.create(payload, files);
    request.subscribe({
      next: (createdId) => {
        const id = this.editing() && current ? current.id : Number(createdId);
        this.editorOpen.set(false); this.selectedFiles.set([]);
        this.load(id, this.editing() ? 'Documento aggiornato.' : 'Documento aggiunto all’archivio.');
      },
      error: (error: unknown) => this.fail(apiErrorMessage(error, 'Il documento non è stato salvato.'))
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
      error: (error: unknown) => this.fail(apiErrorMessage(error, 'Il documento non è stato eliminato.'))
    });
  }

  openPreview(attachment: DocumentAttachment): void {
    if (!this.isPreviewable(attachment)) return;
    this.previewTarget.set(attachment); this.error.set(''); this.success.set('');
  }

  closePreview(): void {
    this.previewTarget.set(null);
  }

  confirmAttachmentDelete(attachment: DocumentAttachment): void {
    if (!this.selected()?.can_edit) return;
    this.attachmentDeleteTarget.set(attachment); this.error.set(''); this.success.set('');
  }

  closeAttachmentDelete(): void {
    if (!this.busy()) this.attachmentDeleteTarget.set(null);
  }

  deleteAttachment(): void {
    const document = this.selected();
    const attachment = this.attachmentDeleteTarget();
    if (!document || !attachment || this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.api.deleteAttachment(document.id, attachment.id, document.version).subscribe({
      next: () => {
        this.attachmentDeleteTarget.set(null);
        if (this.previewTarget()?.id === attachment.id) this.previewTarget.set(null);
        this.load(document.id, `File “${attachment.name}” eliminato definitivamente.`);
      },
      error: (error: unknown) => this.fail(apiErrorMessage(error, 'Il file non è stato eliminato.'))
    });
  }

  isPreviewable(attachment: DocumentAttachment): boolean {
    return attachment.mime.startsWith('image/') || attachment.mime === 'application/pdf';
  }

  isImage(attachment: DocumentAttachment): boolean {
    return attachment.mime.startsWith('image/');
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

  documentIcon(document: DocumentItem): string {
    if (document.attachments.length > 1) return '📚';
    return this.fileIcon(document.attachments[0]?.mime ?? document.attachment_mime);
  }

  fileIcon(file: DocumentAttachment | string | null): string {
    const mime = typeof file === 'string' || file === null ? file : file.mime;
    if (mime === 'application/pdf') return '📕';
    if (mime?.startsWith('image/')) return '🖼️';
    return '📄';
  }

  selectedFilesLabel(): string {
    const files = this.selectedFiles();
    if (files.length === 0) {
      return this.editing() ? 'Aggiungi uno o più file' : 'Seleziona uno o più file';
    }
    if (files.length === 1) return files[0].name;
    return `${files.length} file selezionati`;
  }

  private fail(message: string): void {
    this.error.set(message); this.busy.set(false); this.loading.set(false);
  }

}
