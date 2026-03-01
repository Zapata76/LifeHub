import { Component, OnInit } from '@angular/core';
import { InventoryService, InventoryItem } from './inventory.service';
import { DocumentsService, HubDocument } from '../documents/documents.service';
import { TasksService, FamilyMember } from '../tasks/tasks.service';

@Component({
  selector: 'app-inventory-page',
  template: `
    <div class="container dark-theme">
      <header>
        <div class="header-content">
          <div class="header-row header-top">
            <h1 class="page-title">
              <span class="title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                  <line x1="12" y1="22.08" x2="12" y2="12"/>
                </svg>
              </span>
              <span>Inventario Casa</span>
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
            <h2>Oggetti</h2>
            <button class="btn-primary btn-add-circle" (click)="startNewItem()" title="Nuovo oggetto">+</button>
          </div>
          <div class="filters">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (input)="loadItems()"
              placeholder="Cerca per nome, posizione..."
            />
          </div>

          <ul class="item-list">
            <li
              *ngFor="let item of items"
              [class.active]="selectedItem && selectedItem.id === item.id"
              (click)="selectItem(item)"
            >
              <div class="item-row">
                <div class="item-info">
                  <div class="item-name">{{ item.name }}</div>
                  <div class="item-meta">
                    <span>📍 {{ item.location }}</span>
                    <span>{{ item.category }}</span>
                  </div>
                </div>
              </div>
            </li>
            <li *ngIf="items.length === 0" class="muted">Nessun oggetto trovato</li>
          </ul>
        </section>

        <section class="card editor-panel">
          <!-- VIEW MODE -->
          <div *ngIf="!isEditingMode && selectedItem.id">
            <div class="item-detail-header">
              <h2>{{ selectedItem.name }}</h2>
              <div class="item-detail-meta">
                <span class="badge">{{ selectedItem.category }}</span>
                <span class="meta-item">📍 {{ selectedItem.location }}</span>
                <span class="meta-item" *ngIf="selectedItem.owner_name">👤 {{ selectedItem.owner_name }}</span>
              </div>
            </div>

            <div class="item-detail-content">
              <div class="detail-section">
                <h3>Informazioni</h3>
                <div class="info-grid">
                  <div class="info-item">
                    <label>Data Acquisto</label>
                    <div>{{ selectedItem.purchase_date || 'N/D' }}</div>
                  </div>
                  <div class="info-item">
                    <label>Scadenza Garanzia</label>
                    <div [class.expired]="isExpired(selectedItem.warranty_expiry)">
                      {{ selectedItem.warranty_expiry || 'N/D' }}
                      <span *ngIf="isExpired(selectedItem.warranty_expiry) && selectedItem.warranty_expiry" class="expired-label">(SCADUTA)</span>
                    </div>
                  </div>
                  <div class="info-item" *ngIf="selectedItem.document_title">
                    <label>Documento Collegato</label>
                    <div class="doc-link">📄 {{ selectedItem.document_title }}</div>
                  </div>
                </div>
              </div>

              <div class="detail-section" *ngIf="selectedItem.notes">
                <h3>Note</h3>
                <div class="notes-display">{{ selectedItem.notes }}</div>
              </div>
            </div>

            <div class="footer-actions">
              <button class="btn-primary" (click)="isEditingMode = true">Modifica</button>
              <button class="btn-danger" (click)="deleteItem(selectedItem.id)">Elimina</button>
            </div>
          </div>

          <!-- EDIT MODE -->
          <div *ngIf="isEditingMode || !selectedItem.id">
            <h2>{{ selectedItem?.id ? 'Modifica Oggetto' : 'Nuovo Oggetto' }}</h2>
            <div class="form-grid">
              <div class="form-group col-2">
                <label>Nome</label>
                <input type="text" [(ngModel)]="selectedItem.name" placeholder="Es. Trapano a percussione" />
              </div>
              <div class="form-group">
                <label>Categoria</label>
                <select [(ngModel)]="selectedItem.category">
                  <option value="Tecnologia">Tecnologia</option>
                  <option value="Attrezzi">Attrezzi</option>
                  <option value="Giochi">Giochi</option>
                  <option value="Documenti">Documenti</option>
                  <option value="Altro">Altro</option>
                </select>
              </div>
              <div class="form-group">
                <label>Posizione Fisica</label>
                <input type="text" [(ngModel)]="selectedItem.location" placeholder="Es. Armadio corridoio" />
              </div>
              <div class="form-group">
                <label>Proprietario</label>
                <select [(ngModel)]="selectedItem.owner_id">
                  <option [ngValue]="null">Nessuno</option>
                  <option *ngFor="let m of members" [value]="m.id">{{ m.username }}</option>
                </select>
              </div>
              <div class="form-group">
                <label>Documento Collegato</label>
                <select [(ngModel)]="selectedItem.document_id">
                  <option [ngValue]="null">Nessuno</option>
                  <option *ngFor="let d of documents" [value]="d.id">{{ d.title }}</option>
                </select>
              </div>
              <div class="form-group">
                <label>Data Acquisto</label>
                <input type="date" [(ngModel)]="selectedItem.purchase_date" />
              </div>
              <div class="form-group">
                <label>Scadenza Garanzia</label>
                <input type="date" [(ngModel)]="selectedItem.warranty_expiry" />
              </div>
            </div>

            <div class="form-group">
              <label>Note</label>
              <textarea [(ngModel)]="selectedItem.notes" placeholder="Dettagli aggiuntivi, numero di serie, ecc."></textarea>
            </div>

            <div class="footer-actions">
              <button class="btn-primary" (click)="saveItem()" [disabled]="!selectedItem.name?.trim() || isSaving">
                <span *ngIf="!isSaving">Salva oggetto</span>
                <span *ngIf="isSaving" class="spinner-inline">Attendere...</span>
              </button>
              <button class="btn-secondary" (click)="cancelEdit()" [disabled]="isSaving">Annulla</button>
              <button class="btn-danger" *ngIf="selectedItem.id" (click)="deleteItem(selectedItem.id)">Elimina</button>
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
    .item-list { list-style: none; margin: 0; padding: 0; max-height: 68vh; overflow: auto; }
    .item-list li { padding: 10px; border: 1px solid #2a2a2a; border-radius: 8px; margin-bottom: 8px; cursor: pointer; background: #222; }
    .item-list li.active { border-color: #4f8cff; background: #1f2d43; }
    .item-row { display: flex; gap: 12px; align-items: center; }
    .item-info { flex-grow: 1; min-width: 0; }
    .item-name { font-weight: 600; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .item-meta { font-size: 0.75rem; color: #9aa0a6; display: flex; gap: 10px; flex-wrap: wrap; }

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
    .btn-sm { padding: 6px 10px; font-size: 0.82rem; }

    .item-detail-header { border-bottom: 1px solid #2a2a2a; padding-bottom: 15px; margin-bottom: 20px; }
    .item-detail-meta { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .badge { background: #4f8cff; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    .meta-item { color: #9aa0a6; font-size: 0.85rem; display: flex; align-items: center; gap: 5px; }

    .detail-section { margin-bottom: 24px; }
    .detail-section h3 { font-size: 0.9rem; color: #4f8cff; text-transform: uppercase; margin-bottom: 10px; border-left: 3px solid #4f8cff; padding-left: 10px; }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }
    .info-item label { margin-bottom: 2px; }
    .notes-display { white-space: pre-wrap; line-height: 1.6; color: #e4e4e4; background: #222; padding: 10px; border-radius: 8px; border: 1px solid #2a2a2a; }
    .doc-link { color: #4f8cff; }
    .expired { color: #ff5c5c; }
    .expired-label { font-size: 0.7rem; font-weight: bold; margin-left: 5px; }

    .spinner-inline::after { content: ""; width: 12px; height: 12px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; margin-left: 5px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 980px) {
      .layout { grid-template-columns: 1fr; }
      .item-list { max-height: 34vh; }
    }
    @media (max-width: 700px) {
      .form-grid { grid-template-columns: 1fr; }
      .col-2 { grid-column: span 1; }
    }
  `]
})
export class InventoryPageComponent implements OnInit {
  items: InventoryItem[] = [];
  documents: HubDocument[] = [];
  members: FamilyMember[] = [];
  searchQuery: string = '';
  isSaving: boolean = false;
  isEditingMode: boolean = false;
  selectedItem: InventoryItem = this.emptyItem();

  constructor(
    private invService: InventoryService,
    private docsService: DocumentsService,
    private tasksService: TasksService
  ) {}

  ngOnInit() {
    this.loadItems();
    this.loadDocuments();
    this.loadMembers();
  }

  loadItems() {
    this.invService.getItems(this.searchQuery).subscribe(items => {
      this.items = items || [];
    });
  }

  loadDocuments() {
    this.docsService.getDocuments().subscribe(docs => this.documents = docs || []);
  }

  loadMembers() {
    this.tasksService.getFamilyMembers().subscribe(m => this.members = m || []);
  }

  emptyItem(): InventoryItem {
    return {
      name: '',
      category: 'Altro',
      location: '',
      owner_id: null,
      document_id: null,
      notes: ''
    };
  }

  startNewItem() {
    this.selectedItem = this.emptyItem();
    this.isEditingMode = true;
  }

  selectItem(item: InventoryItem) {
    this.selectedItem = { ...item };
    this.isEditingMode = false;
  }

  cancelEdit() {
    if (this.selectedItem.id) {
      this.isEditingMode = false;
    } else {
      this.startNewItem();
    }
  }

  saveItem() {
    if (!this.selectedItem.name.trim()) return;
    this.isSaving = true;
    this.invService.saveItem(this.selectedItem).subscribe(res => {
      this.isSaving = false;
      this.isEditingMode = false;
      this.loadItems();
      if (res && res.id) {
        // Find the saved item in the list or reload details
        this.selectedItem.id = res.id;
        this.loadItems();
      }
    }, err => {
      this.isSaving = false;
      alert('Errore: ' + (err.error?.error || err.message));
    });
  }

  deleteItem(id?: number) {
    if (id && confirm('Sei sicuro di voler eliminare questo oggetto?')) {
      this.invService.deleteItem(id).subscribe(() => {
        this.selectedItem = this.emptyItem();
        this.loadItems();
      });
    }
  }

  isExpired(date?: string): boolean {
    if (!date) return false;
    return new Date(date) < new Date();
  }
}
