import { Component, OnInit } from '@angular/core';
import { DocumentsService, HubDocument } from './documents.service';

@Component({
  selector: 'app-documents-page',
  template: `
    <div class="container dark-theme">
      <header>
        <div class="header-content">
          <div class="header-row header-top">
            <h1 class="page-title">
              <span class="title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </span>
              <span>Archivio Documenti</span>
            </h1>
          </div>
          <div class="header-row header-bottom">
            <div class="header-controls">
              <a routerLink="/home" class="home-link">Home Hub</a>
            </div>
          </div>
        </div>
      </header>

      <main class="layout">
        <section class="card list-panel">
          <div class="card-header">
            <h2>Documenti</h2>
            <button class="btn-primary btn-add-circle" (click)="startNewDoc()" title="Nuovo documento">+</button>
          </div>
          <div class="filters">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (input)="loadDocuments()"
              placeholder="Cerca per titolo, tag..."
            />
          </div>

          <ul class="doc-list">
            <li
              *ngFor="let doc of documents"
              [class.active]="selectedDoc && selectedDoc.id === doc.id"
              (click)="selectDoc(doc)"
            >
              <div class="doc-row">
                <div class="doc-info">
                  <div class="doc-name">{{ doc.title }}</div>
                  <div class="doc-meta">
                    <span>{{ doc.category }}</span>
                    <span>{{ doc.created_at | date:'dd/MM/yyyy' }}</span>
                  </div>
                </div>
              </div>
            </li>
            <li *ngIf="documents.length === 0" class="muted">Nessun documento trovato</li>
          </ul>
        </section>

        <section class="card editor-panel">
          <!-- VIEW MODE -->
          <div *ngIf="!isEditingMode && selectedDoc.id">
            <div class="doc-detail-header">
              <h2>{{ selectedDoc.title }}</h2>
              <div class="doc-detail-meta">
                <span class="badge">{{ selectedDoc.category }}</span>
                <span class="meta-item">📅 {{ selectedDoc.created_at | date:'dd/MM/yyyy' }}</span>
              </div>
            </div>

            <div class="doc-detail-content">
              <div class="detail-section" *ngIf="selectedDoc.tags">
                <h3>Tag</h3>
                <div class="tags-container">
                  <span *ngFor="let tag of selectedDoc.tags.split(',')" class="tag-badge">{{ tag.trim() }}</span>
                </div>
              </div>

              <div class="detail-section" *ngIf="selectedDoc.notes">
                <h3>Note</h3>
                <div class="notes-display">{{ selectedDoc.notes }}</div>
              </div>

              <div class="detail-section">
                <h3>File</h3>
                <div class="file-view-container">
                  <a [href]="selectedDoc.file_path" target="_blank" class="btn-secondary btn-file">
                    <span class="icon">📄</span> Apri/Scarica Documento
                  </a>
                </div>
              </div>
            </div>

            <div class="footer-actions">
              <button class="btn-primary" (click)="isEditingMode = true">Modifica</button>
              <button class="btn-danger" (click)="deleteDocument(selectedDoc.id)">Elimina</button>
            </div>
          </div>

          <!-- EDIT MODE -->
          <div *ngIf="isEditingMode || !selectedDoc.id">
            <h2>{{ selectedDoc?.id ? 'Modifica Documento' : 'Nuovo Documento' }}</h2>
            <div class="form-grid">
              <div class="form-group col-2">
                <label>Titolo</label>
                <input type="text" [(ngModel)]="selectedDoc.title" placeholder="Es. Contratto Affitto 2024" />
              </div>
              <div class="form-group">
                <label>Categoria</label>
                <select [(ngModel)]="selectedDoc.category">
                  <option value="Contratti">Contratti</option>
                  <option value="Certificati">Certificati</option>
                  <option value="Bollette">Bollette</option>
                  <option value="Garanzie">Garanzie</option>
                  <option value="Altro">Altro</option>
                </select>
              </div>
              <div class="form-group">
                <label>Tag (separati da virgola)</label>
                <input type="text" [(ngModel)]="selectedDoc.tags" placeholder="Es. casa, 2024, importante" />
              </div>
            </div>

            <div class="form-group">
              <label>Note</label>
              <textarea [(ngModel)]="selectedDoc.notes" placeholder="Descrizione o dettagli del documento"></textarea>
            </div>

            <div class="form-group">
              <label>File (PDF, Immagine)</label>
              <div class="file-upload-container">
                <div class="file-preview" *ngIf="selectedDoc.file_path && !selectedFile">
                  <span class="muted">File attuale: {{ selectedDoc.file_path }}</span>
                </div>
                <div class="upload-controls">
                  <label class="upload-btn">
                    <span class="icon">📁</span> {{ selectedFile ? selectedFile.name : 'Seleziona file' }}
                    <input type="file" (change)="onFileSelected($event)" hidden />
                  </label>
                </div>
              </div>
            </div>

            <div class="footer-actions">
              <button class="btn-primary" (click)="saveDocument()" [disabled]="!selectedDoc.title?.trim() || isSaving">
                <span *ngIf="!isSaving">Salva documento</span>
                <span *ngIf="isSaving" class="spinner-inline">Attendere...</span>
              </button>
              <button class="btn-secondary" (click)="cancelEdit()" [disabled]="isSaving">Annulla</button>
              <button class="btn-danger" *ngIf="selectedDoc.id" (click)="deleteDocument(selectedDoc.id)">Elimina</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  `,
  styles: [`
    .dark-theme { background: #121212; color: #e4e4e4; min-height: 100vh; font-family: system-ui, sans-serif; }
    header { background: #1e1e1e; border-bottom: 1px solid #2a2a2a; padding: 15px 20px; }
    .header-content { display: flex; flex-direction: column; gap: 10px; }
    .header-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .header-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .page-title { color: #4f8cff; margin: 0; font-size: 1.4rem; display: flex; align-items: center; gap: 10px; }
    .title-icon { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 22px; }
    .title-icon svg { width: 100%; height: 100%; fill: none; stroke: #4f8cff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    h2 { margin-top: 0; color: #4f8cff; font-size: 1.1rem; }
    .home-link { color: #9aa0a6; text-decoration: none; font-size: 0.85rem; border: 1px solid #333; padding: 4px 10px; border-radius: 6px; background: #2a2a2a; }

    .layout { max-width: 1250px; margin: 0 auto; padding: 18px; display: grid; grid-template-columns: 340px 1fr; gap: 18px; }
    .card { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 12px; padding: 16px; box-sizing: border-box; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .card-header h2 { margin: 0; }
    .btn-add-circle { width: 32px; height: 32px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; line-height: 1; }

    .filters { display: grid; gap: 8px; margin-bottom: 12px; }
    .doc-list { list-style: none; margin: 0; padding: 0; max-height: 68vh; overflow: auto; }
    .doc-list li { padding: 10px; border: 1px solid #2a2a2a; border-radius: 8px; margin-bottom: 8px; cursor: pointer; background: #222; }
    .doc-list li.active { border-color: #4f8cff; background: #1f2d43; }
    .doc-row { display: flex; gap: 12px; align-items: center; }
    .doc-info { flex-grow: 1; min-width: 0; }
    .doc-name { font-weight: 600; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .doc-meta { font-size: 0.75rem; color: #9aa0a6; display: flex; gap: 10px; flex-wrap: wrap; }

    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .col-2 { grid-column: span 2; }
    .form-group { margin-bottom: 14px; }
    label { display: block; margin-bottom: 6px; color: #9aa0a6; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.4px; }
    input, select, textarea { width: 100%; border: 1px solid #333; border-radius: 8px; background: #121212; color: #fff; padding: 10px; box-sizing: border-box; }
    textarea { min-height: 140px; resize: vertical; }
    .muted { color: #8e949b; font-size: 0.84rem; }

    .footer-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; }
    button { border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
    .btn-primary { background: #4f8cff; color: #fff; padding: 10px 14px; }
    .btn-secondary { background: #333; color: #e4e4e4; padding: 10px 14px; }
    .btn-danger { background: #8c2d2d; color: #fff; padding: 10px 12px; }
    .btn-file { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }

    .doc-detail-header { border-bottom: 1px solid #2a2a2a; padding-bottom: 15px; margin-bottom: 20px; }
    .doc-detail-meta { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .badge { background: #4f8cff; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    .meta-item { color: #9aa0a6; font-size: 0.85rem; display: flex; align-items: center; gap: 5px; }

    .detail-section { margin-bottom: 24px; }
    .detail-section h3 { font-size: 0.9rem; color: #4f8cff; text-transform: uppercase; margin-bottom: 10px; border-left: 3px solid #4f8cff; padding-left: 10px; }
    .tags-container { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag-badge { background: #2a2a2a; border: 1px solid #333; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; color: #e4e4e4; }
    .notes-display { white-space: pre-wrap; line-height: 1.6; color: #e4e4e4; background: #222; padding: 10px; border-radius: 8px; border: 1px solid #2a2a2a; }

    .upload-btn { display: inline-flex; align-items: center; gap: 8px; background: #2a2a2a; border: 2px dashed #444; padding: 15px 10px; border-radius: 12px; cursor: pointer; color: #4f8cff; width: 100%; box-sizing: border-box; justify-content: center; font-weight: 600; }
    .upload-btn:hover { background: #333; border-color: #4f8cff; }

    .spinner-inline::after { content: ""; width: 12px; height: 12px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; margin-left: 5px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 980px) {
      .layout { grid-template-columns: 1fr; }
      .doc-list { max-height: 34vh; }
    }
    @media (max-width: 700px) {
      .form-grid { grid-template-columns: 1fr; }
      .col-2 { grid-column: span 1; }
    }
  `]
})
export class DocumentsPageComponent implements OnInit {
  documents: HubDocument[] = [];
  searchQuery: string = '';
  isSaving: boolean = false;
  isEditingMode: boolean = false;
  selectedDoc: HubDocument = this.emptyDoc();
  selectedFile: File | null = null;

  constructor(private docsService: DocumentsService) {}

  ngOnInit() {
    this.loadDocuments();
  }

  loadDocuments() {
    this.docsService.getDocuments(this.searchQuery).subscribe(docs => {
      this.documents = docs || [];
    });
  }

  emptyDoc(): HubDocument {
    return {
      title: '',
      category: 'Altro',
      file_path: '',
      tags: '',
      notes: ''
    };
  }

  startNewDoc() {
    this.selectedDoc = this.emptyDoc();
    this.isEditingMode = true;
    this.selectedFile = null;
  }

  selectDoc(doc: HubDocument) {
    this.selectedDoc = { ...doc };
    this.isEditingMode = false;
    this.selectedFile = null;
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
  }

  cancelEdit() {
    if (this.selectedDoc.id) {
      this.isEditingMode = false;
    } else {
      this.startNewDoc();
    }
  }

  saveDocument() {
    if (!this.selectedDoc.title.trim()) return;
    this.isSaving = true;

    const formData = new FormData();
    if (this.selectedDoc.id) formData.append('id', this.selectedDoc.id.toString());
    formData.append('title', this.selectedDoc.title);
    formData.append('category', this.selectedDoc.category || '');
    formData.append('tags', this.selectedDoc.tags || '');
    formData.append('notes', this.selectedDoc.notes || '');
    
    if (this.selectedFile) {
      formData.append('file', this.selectedFile);
    } else if (this.selectedDoc.id) {
      formData.append('existing_file_path', this.selectedDoc.file_path || '');
    }

    this.docsService.saveDocument(formData).subscribe(res => {
      this.isSaving = false;
      this.isEditingMode = false;
      this.loadDocuments();
      if (res && res.id) {
        this.selectedDoc.id = res.id;
        this.loadDocuments();
      }
    }, err => {
      this.isSaving = false;
      alert('Errore: ' + (err.error?.error || err.message));
    });
  }

  deleteDocument(id?: number) {
    if (id && confirm('Sei sicuro di voler eliminare questo documento?')) {
      this.docsService.deleteDocument(id).subscribe(() => {
        this.selectedDoc = this.emptyDoc();
        this.loadDocuments();
      });
    }
  }
}
