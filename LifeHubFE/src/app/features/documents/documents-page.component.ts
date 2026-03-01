import { Component, OnInit } from '@angular/core';
import { DocumentsService, HubDocument } from './documents.service';

@Component({
  selector: 'app-documents-page',
  templateUrl: './documents-page.component.html',
  styleUrls: ['./documents-page.component.css']
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
