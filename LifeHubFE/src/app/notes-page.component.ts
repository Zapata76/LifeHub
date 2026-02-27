import { Component, OnInit } from '@angular/core';
import { NotesService, Note } from './notes.service';

@Component({
  selector: 'app-notes-page',
  template: `
    <div class="container dark-theme">
      <header>
        <div class="header-content">
          <div class="header-row header-top">
            <h1 class="page-title">
              <span class="title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M8 3h6l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>
                  <path d="M14 3v4h4"/>
                  <path d="M9 9h2"/>
                  <path d="M9 13h6"/>
                  <path d="M9 17h6"/>
                </svg>
              </span>
              <span>Note Condivise</span>
            </h1>
          </div>
          <div class="header-row header-bottom">
            <div class="header-controls">
                <button class="btn-primary btn-sm" (click)="createNewNote()">+ Nuova</button>
                <span class="user-badge" *ngIf="userAuthor">{{ userAuthor }}</span>
                <a href="#/home" class="home-link">Home Hub</a>
            </div>
          </div>
        </div>
      </header>

      <main>
        <!-- Editor Nota (Modal) -->
        <div class="modal" *ngIf="editingNote" (click)="cancelEdit()">
          <div class="modal-content card" (click)="$event.stopPropagation()" [style.border-top-color]="editingNote.color">
            
            <div class="modal-body-scroll">
                <input type="text" [(ngModel)]="editingNote.title" placeholder="Titolo" class="note-title-input" [disabled]="isSaving">
                
                <textarea [(ngModel)]="editingNote.content" placeholder="Inizia a scrivere..." class="note-textarea" [disabled]="isSaving"></textarea>
                
                <!-- Gestione Foto nell'editor -->
                <div class="photo-section">
                    <div class="photo-preview-container" *ngIf="previewUrl || editingNote.image_url">
                        <img [src]="previewUrl || '/umbertini/' + editingNote.image_url" class="photo-preview">
                        <button class="remove-photo" (click)="removePhoto()" *ngIf="!isSaving">&times;</button>
                    </div>
                    <div class="photo-upload" *ngIf="!previewUrl && !editingNote.image_url && !isSaving">
                        <label class="upload-label">
                            &#128247; Aggiungi Foto
                            <input type="file" (change)="onFileSelected($event)" accept="image/*" capture="environment" hidden>
                        </label>
                    </div>
                </div>
            </div>

            <div class="modal-footer">
              <div class="footer-top">
                  <div class="color-picker" *ngIf="!isSaving">
                    <div *ngFor="let c of colors" [style.background]="c" (click)="editingNote.color = c" [class.selected]="editingNote.color === c"></div>
                  </div>
              </div>
              <div class="footer-actions">
                <button class="btn-secondary" (click)="cancelEdit()" [disabled]="isSaving">Annulla</button>
                <button class="btn-primary" (click)="saveNote()" [disabled]="isSaving || (!editingNote.title && !editingNote.content)">
                    <span *ngIf="!isSaving">Salva</span>
                    <span *ngIf="isSaving" class="spinner-inline">...</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Elenco Note (Grid) -->
        <div class="notes-grid">
          <div class="note-card card" *ngFor="let n of notes" [style.border-top-color]="n.color" (click)="editNote(n)">
            <div class="note-img-preview" *ngIf="n.image_url">
                <img [src]="'/umbertini/' + n.image_url">
            </div>
            <div class="note-body">
                <div class="note-header">
                  <h3>{{ n.title || 'Senza titolo' }}</h3>
                  <button class="pin-btn" [class.active]="n.is_pinned" (click)="togglePin(n); $event.stopPropagation()">
                    {{ n.is_pinned ? 'Fissa' : 'Pin' }}
                  </button>
                </div>
                <p class="note-preview">{{ n.content }}</p>
                <div class="note-footer">
                  <span class="author">By {{ n.author }}</span>
                  <button class="delete-btn" (click)="deleteNote(n); $event.stopPropagation()">Elimina</button>
                </div>
            </div>
          </div>
        </div>
        <div *ngIf="notes.length === 0" class="muted-large">Nessuna nota presente</div>
      </main>
    </div>
  `,
  styles: [`
    .dark-theme { background-color: #121212; color: #e4e4e4; min-height: 100vh; font-family: system-ui, sans-serif; }
    
    header { background-color: #1e1e1e; border-bottom: 1px solid #2a2a2a; padding: 15px 20px; }
    .header-content { display: flex; flex-direction: column; gap: 10px; }
    .header-row { display: flex; justify-content: space-between; align-items: center; }
    .header-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    
    .page-title { color: #4f8cff; font-size: 1.4rem; margin: 0; display: flex; align-items: center; gap: 10px; }
    .title-icon { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 22px; }
    .title-icon svg { width: 100%; height: 100%; fill: none; stroke: #4f8cff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .user-badge { font-size: 0.8rem; color: #4f8cff; border: 1px solid #4f8cff44; padding: 4px 10px; border-radius: 6px; }
    .home-link { color: #9aa0a6; text-decoration: none; font-size: 0.85rem; border: 1px solid #333; padding: 4px 10px; border-radius: 6px; background: #2a2a2a; }
    
    main { padding: 15px; max-width: 1000px; margin: 0 auto; }
    .notes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    
    .card { background-color: #1e1e1e; border-radius: 12px; border: 1px solid #2a2a2a; box-shadow: 0 4px 10px rgba(0,0,0,0.3); overflow: hidden; }
    .note-card { display: flex; flex-direction: column; border-top: 4px solid #4f8cff; cursor: pointer; transition: 0.2s; max-height: 400px; }
    .note-card:hover { transform: translateY(-3px); }
    .note-img-preview { width: 100%; height: 140px; overflow: hidden; background: #000; }
    .note-img-preview img { width: 100%; height: 100%; object-fit: cover; }
    .note-body { padding: 15px; flex-grow: 1; display: flex; flex-direction: column; }
    .note-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .note-header h3 { margin: 0; font-size: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pin-btn { background: transparent; border: none; cursor: pointer; font-size: 1.1rem; opacity: 0.4; }
    .pin-btn.active { opacity: 1; }
    .note-preview { font-size: 0.9rem; color: #9aa0a6; white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; margin-bottom: 10px; }
    .note-footer { margin-top: auto; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #2a2a2a; padding-top: 10px; font-size: 0.75rem; }
    .delete-btn { background: transparent; border: none; cursor: pointer; opacity: 0.5; }

    /* Modal / Editor Corretto */
    .modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 10px; }
    .modal-content { width: 100%; max-width: 550px; max-height: 95vh; display: flex; flex-direction: column; border-top: 6px solid #4f8cff; }
    .modal-body-scroll { padding: 20px; overflow-y: auto; flex-grow: 1; }
    .note-title-input { width: 100%; background: transparent; border: none; color: white; font-size: 1.4rem; font-weight: bold; margin-bottom: 15px; outline: none; }
    .note-textarea { width: 100%; min-height: 150px; background: transparent; border: none; color: #e4e4e4; font-size: 1rem; resize: none; outline: none; line-height: 1.5; }
    
    .photo-section { margin: 15px 0; }
    .photo-preview-container { position: relative; border-radius: 8px; overflow: hidden; border: 1px solid #333; }
    .photo-preview { width: 100%; max-height: 40vh; object-fit: contain; background: #080808; display: block; }
    .remove-photo { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); color: white; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 1.2rem; }
    .upload-label { display: block; padding: 20px; border: 2px dashed #333; border-radius: 10px; text-align: center; cursor: pointer; color: #4f8cff; }

    .modal-footer { padding: 15px 20px; border-top: 1px solid #2a2a2a; background: #1e1e1e; }
    .footer-top { margin-bottom: 15px; }
    .color-picker { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .color-picker div { width: 28px; height: 28px; border-radius: 50%; cursor: pointer; border: 2px solid rgba(255,255,255,0.1); }
    .color-picker div.selected { border-color: #4f8cff; transform: scale(1.1); }
    
    .footer-actions { display: flex; gap: 10px; }
    .footer-actions button { flex: 1; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; border: none; }
    .btn-primary { background: #4f8cff; color: white; }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-secondary { background: #2a2a2a; color: #e4e4e4; }
    .btn-sm { padding: 6px 15px; font-size: 0.85rem; width: auto; }

    .spinner-inline::after { content: ""; width: 12px; height: 12px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; margin-left: 5px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .muted-large { text-align: center; color: #444; font-size: 1.2rem; margin-top: 100px; font-style: italic; }
  `]
})
export class NotesPageComponent implements OnInit {
  notes: Note[] = [];
  editingNote: Note | null = null;
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  isSaving = false;
  userAuthor: string = '';
  colors = ['#1e1e1e', '#2c3e50', '#8e44ad', '#2980b9', '#27ae60', '#d35400', '#c0392b'];

  constructor(private notesService: NotesService) {}

  ngOnInit() {
    this.loadNotes();
    // In un caso reale userei un servizio auth, qui simuliamo dal primo caricamento note
  }

  loadNotes() {
    this.notesService.getNotes().subscribe(data => {
      this.notes = data.map(n => ({
        ...n,
        is_pinned: Number(n.is_pinned) === 1
      }));
      if (this.notes.length > 0 && !this.userAuthor) {
          // Piccola scorciatoia per mostrare un nome utente nell'header senza creare un altro servizio
          // (Questo verra migliorato quando avremo un servizio user centralizzato)
      }
    });
  }

  createNewNote() {
    this.editingNote = { title: '', content: '', color: '#1e1e1e', is_pinned: 0 };
    this.previewUrl = null;
    this.selectedFile = null;
  }

  editNote(note: Note) {
    this.editingNote = { ...note };
    this.previewUrl = null;
    this.selectedFile = null;
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
        this.selectedFile = file;
        const reader = new FileReader();
        reader.onload = (e: any) => this.previewUrl = e.target.result;
        reader.readAsDataURL(file);
    }
  }

  removePhoto() {
    this.selectedFile = null;
    this.previewUrl = null;
    if (this.editingNote) this.editingNote.image_url = undefined;
  }

  cancelEdit() {
    if (this.isSaving) return;
    this.editingNote = null;
    this.selectedFile = null;
    this.previewUrl = null;
  }

  saveNote() {
    if (!this.editingNote) return;
    this.isSaving = true;

    const formData = new FormData();
    if (this.editingNote.id) formData.append('id', this.editingNote.id.toString());
    formData.append('title', this.editingNote.title || '');
    formData.append('content', this.editingNote.content || '');
    formData.append('color', this.editingNote.color || '#1e1e1e');
    formData.append('is_pinned', (this.editingNote.is_pinned ? 1 : 0).toString());
    
    if (this.selectedFile) {
        formData.append('photo', this.selectedFile);
    } else if (this.editingNote.image_url) {
        formData.append('existing_image', this.editingNote.image_url);
    }

    this.notesService.saveNote(formData).subscribe(() => {
      this.isSaving = false;
      this.editingNote = null;
      this.loadNotes();
    }, () => this.isSaving = false);
  }

  deleteNote(note: Note) {
    if (confirm("Eliminare questa nota?")) {
      this.notesService.deleteNote(note.id!).subscribe(() => this.loadNotes());
    }
  }

  togglePin(note: Note) {
    const formData = new FormData();
    formData.append('id', note.id!.toString());
    formData.append('title', note.title);
    formData.append('content', note.content);
    formData.append('color', note.color || '#1e1e1e');
    formData.append('is_pinned', (note.is_pinned ? 0 : 1).toString());
    if (note.image_url) formData.append('existing_image', note.image_url);

    this.notesService.saveNote(formData).subscribe(() => this.loadNotes());
  }
}

