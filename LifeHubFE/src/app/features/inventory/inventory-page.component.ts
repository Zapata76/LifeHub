import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
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
  userFilters: { [key: number]: boolean } = {};
  searchControl = new FormControl('');
  itemForm: FormGroup;
  isSaving: boolean = false;
  isEditingMode: boolean = false;
  selectedItem: InventoryItem = this.emptyItem();

  constructor(
    private invService: InventoryService,
    private docsService: DocumentsService,
    private tasksService: TasksService,
    private fb: FormBuilder
  ) {
    this.itemForm = this.fb.group({
      name: ['', Validators.required],
      category: ['Altro'],
      location: [''],
      owner_id: [null],
      document_id: [null],
      purchase_date: [''],
      warranty_expiry: [''],
      notes: ['']
    });
  }

  ngOnInit() {
    this.loadItems();
    this.searchControl.valueChanges.subscribe(() => {
      this.loadItems();
    });
    this.loadDocuments();
    this.loadMembers();
  }

  loadItems() {
    this.invService.getItems(this.searchControl.value || '').subscribe(items => {
      this.items = items || [];
    });
  }

  loadDocuments() {
    this.docsService.getDocuments().subscribe(docs => this.documents = docs || []);
  }

  loadMembers() {
    this.tasksService.getFamilyMembers().subscribe(m => {
      this.members = m || [];
      this.members.forEach(member => {
        if (this.userFilters[member.id] === undefined) {
          this.userFilters[member.id] = true;
        }
      });
    });
  }

  toggleUserFilter(memberId: number) {
    this.userFilters[memberId] = !this.userFilters[memberId];
  }

  getFilteredItems() {
    return this.items.filter(item => {
      if (!item.owner_id) return true;
      return this.userFilters[item.owner_id] !== false;
    });
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
    this.itemForm.reset({
      name: '',
      category: 'Altro',
      location: '',
      owner_id: null,
      document_id: null,
      purchase_date: '',
      warranty_expiry: '',
      notes: ''
    });
    this.isEditingMode = true;
  }

  selectItem(item: InventoryItem) {
    this.selectedItem = { ...item };
    this.itemForm.patchValue({
      name: item.name,
      category: item.category,
      location: item.location,
      owner_id: item.owner_id,
      document_id: item.document_id,
      purchase_date: item.purchase_date,
      warranty_expiry: item.warranty_expiry,
      notes: item.notes
    });
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
    if (this.itemForm.invalid) return;
    this.isSaving = true;
    const itemData = { ...this.selectedItem, ...this.itemForm.value };
    this.invService.saveItem(itemData).subscribe(res => {
      this.isSaving = false;
      this.isEditingMode = false;
      if (res && res.id) {
        this.selectedItem = { ...itemData, id: res.id };
        if (itemData.owner_id) {
          const owner = this.members.find(m => m.id === itemData.owner_id);
          if (owner) this.selectedItem.owner_name = owner.username;
        }
      }
      this.loadItems();
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
