import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { concat, Observable, of } from 'rxjs';
import { apiErrorMessage } from '../../shared/api-error';
import { ConfirmationService } from '../../shared/confirmation.service';
import { ModalBackdropDirective } from '../../shared/modal-backdrop.directive';
import { NoteApiService } from './note-api.service';
import { NoteItem, NoteOverview, NotePayload } from './note.models';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ModalBackdropDirective],
  templateUrl: './notes-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotesPageComponent implements OnDestroy {
  readonly api = inject(NoteApiService);
  private readonly confirmation = inject(ConfirmationService);
  readonly overview = signal<NoteOverview | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly showArchived = signal(false);
  readonly search = signal('');
  readonly visibleAuthors = signal<Set<number>>(new Set());
  readonly filtersInitialized = signal(false);
  readonly editorOpen = signal(false);
  readonly editing = signal<NoteItem | null>(null);
  readonly imageFile = signal<File | null>(null);
  readonly imagePreview = signal<string | null>(null);
  readonly removeExistingImage = signal(false);
  readonly colors = ['#1e1e1e', '#2c3e50', '#8e44ad', '#2980b9', '#27ae60', '#d35400', '#c0392b'];
  readonly mobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
    .test(navigator.userAgent);

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    body: new FormControl('', { nonNullable: true }),
    color: new FormControl('#1e1e1e', { nonNullable: true }),
    pinned: new FormControl(false, { nonNullable: true })
  });

  readonly filteredNotes = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('it');
    const authors = this.visibleAuthors();
    return (this.overview()?.items ?? []).filter((note) => {
      if (!authors.has(Number(note.created_by))) return false;
      if (!term) return true;
      return [note.title, note.body, note.author_name]
        .some((value) => (value ?? '').toLocaleLowerCase('it').includes(term));
    });
  });

  constructor() { this.load(); }

  load(message = ''): void {
    this.loading.set(true); this.error.set('');
    this.api.overview(this.showArchived()).subscribe({
      next: (overview) => {
        const normalized = {
          ...overview,
          members: overview.members.map((member) => ({ ...member, id: Number(member.id) }))
        };
        this.overview.set(normalized);
        if (!this.filtersInitialized()) {
          this.visibleAuthors.set(new Set(normalized.members.map((member) => member.id)));
          this.filtersInitialized.set(true);
        }
        this.loading.set(false); this.busy.set(false); this.success.set(message);
      },
      error: () => this.fail('Impossibile caricare le note.')
    });
  }

  toggleArchive(): void {
    if (this.busy()) return;
    this.showArchived.update((value) => !value);
    this.load();
  }

  toggleAuthor(id: number): void {
    const next = new Set(this.visibleAuthors());
    next.has(id) ? next.delete(id) : next.add(id);
    this.visibleAuthors.set(next);
  }

  openCreate(): void {
    this.resetEditor(); this.editing.set(null); this.editorOpen.set(true);
  }

  openEdit(note: NoteItem): void {
    if (this.showArchived() || !note.can_edit) return;
    this.resetEditor(); this.editing.set(note);
    this.form.setValue({
      title: note.title ?? '', body: note.body ?? '', color: note.color_hex || '#1e1e1e',
      pinned: this.isPinned(note)
    });
    this.editorOpen.set(true);
  }

  async closeEditor(force = false): Promise<void> {
    if (this.busy()) return;
    if (!force && this.hasUnsavedChanges() && !await this.confirmation.confirm({
      title: 'Modifiche non salvate',
      message: 'Scartare le modifiche non salvate?',
      confirmLabel: 'Scarta',
      danger: true
    })) return;
    this.editorOpen.set(false); this.resetEditor();
  }

  save(): void {
    if (this.noteEmpty() || this.busy()) return;
    const note = this.editing();
    const value = this.form.getRawValue();
    const payload: NotePayload = {
      title: value.title.trim(), body: value.body.trim(), color: value.color,
      pinned: value.pinned, ...(note ? { version: Number(note.version) } : {})
    };
    this.busy.set(true); this.error.set(''); this.success.set('');
    const request: Observable<number | void> = note
      ? this.api.update(Number(note.id), payload)
      : this.api.create(payload);
    request.subscribe({
      next: (createdId: number | void) => this.persistImage(note ? Number(note.id) : Number(createdId)),
      error: (error: unknown) => this.fail(apiErrorMessage(error, 'La nota non è stata salvata.'))
    });
  }

  togglePin(note: NoteItem, event?: Event): void {
    event?.stopPropagation();
    if (!note.can_edit || this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.api.setPinned(Number(note.id), Number(note.version), !this.isPinned(note)).subscribe({
      next: () => this.load(),
      error: () => this.fail('La nota è cambiata: ricarica e riprova.')
    });
  }

  async setArchived(note: NoteItem, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!note.can_edit || this.busy()) return;
    const restore = this.showArchived();
    if (!restore && !await this.confirmation.confirm({
      title: 'Archivia nota',
      message: `Archiviare “${note.title || 'Senza titolo'}”? Potrai ripristinarla dall’archivio.`,
      confirmLabel: 'Archivia',
      danger: true
    })) return;
    this.busy.set(true); this.error.set('');
    this.api.setArchived(Number(note.id), Number(note.version), restore).subscribe({
      next: () => {
        if (this.editorOpen()) { this.editorOpen.set(false); this.resetEditor(); }
        this.load(restore ? 'Nota ripristinata.' : 'Nota archiviata.');
      },
      error: () => this.fail('La nota è cambiata: ricarica e riprova.')
    });
  }

  selectImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.revokePreview(); this.imageFile.set(file); this.imagePreview.set(URL.createObjectURL(file));
    this.removeExistingImage.set(false); this.form.markAsDirty();
  }

  removePhoto(): void {
    this.revokePreview(); this.imageFile.set(null);
    this.removeExistingImage.set(!!this.editing()?.image_attachment_id); this.form.markAsDirty();
  }

  imageSource(note: NoteItem | null): string | null {
    if (this.imagePreview()) return this.imagePreview();
    if (this.removeExistingImage() || !note?.image_attachment_id) return null;
    return this.api.attachment(Number(note.image_attachment_id));
  }

  isPinned(note: NoteItem): boolean { return Number(note.is_pinned) === 1 || note.is_pinned === true; }
  noteColorClass(color: string | null | undefined): string {
    const index = this.colors.indexOf((color || this.colors[0]).toLowerCase());
    return `note-color-${index < 0 ? 0 : index}`;
  }
  noteEmpty(): boolean {
    const value = this.form.getRawValue();
    return value.title.trim() === '' && value.body.trim() === '';
  }
  setSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }

  @HostListener('window:beforeunload', ['$event'])
  preventAccidentalNavigation(event: BeforeUnloadEvent): void {
    if (this.editorOpen() && this.hasUnsavedChanges()) event.returnValue = '';
  }

  ngOnDestroy(): void { this.revokePreview(); }

  private persistImage(id: number): void {
    const operations: Observable<void>[] = [];
    const uploadedImage = !!this.imageFile();
    if (this.removeExistingImage()) operations.push(this.api.removeImage(id));
    if (this.imageFile()) operations.push(this.api.uploadImage(id, this.imageFile()!));
    (operations.length ? concat(...operations) : of(undefined)).subscribe({
      complete: () => {
        this.editorOpen.set(false); this.resetEditor();
        this.load(uploadedImage ? 'Nota e foto salvate.' : 'Nota salvata.');
      },
      error: () => this.fail('Nota salvata, ma la foto non è stata aggiornata.')
    });
  }

  private hasUnsavedChanges(): boolean {
    return this.form.dirty || !!this.imageFile() || this.removeExistingImage();
  }

  private resetEditor(): void {
    this.form.reset({ title: '', body: '', color: '#1e1e1e', pinned: false });
    this.form.markAsPristine(); this.imageFile.set(null); this.removeExistingImage.set(false);
    this.revokePreview();
  }

  private revokePreview(): void {
    const preview = this.imagePreview();
    if (preview) URL.revokeObjectURL(preview);
    this.imagePreview.set(null);
  }

  private fail(message: string): void { this.error.set(message); this.busy.set(false); this.loading.set(false); }
}
