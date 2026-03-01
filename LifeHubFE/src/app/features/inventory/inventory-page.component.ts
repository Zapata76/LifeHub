import { Component, OnInit } from '@angular/core';
import { InventoryService, InventoryItem } from './inventory.service';
import { DocumentsService, HubDocument } from '../documents/documents.service';
import { TasksService, FamilyMember } from '../tasks/tasks.service';

@Component({
  selector: 'app-inventory-page',
  templateUrl: './inventory-page.component.html',
  styleUrls: ['./inventory-page.component.css']
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
