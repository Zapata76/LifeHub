import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { DocumentsService, HubDocument } from './documents.service';

@Component({
    selector: 'app-documents-page',
    templateUrl: './documents-page.component.html',
    styleUrls: ['./documents-page.component.css'],
    standalone: false
})
export class DocumentsPageComponent implements OnInit {
  documents: HubDocument[] = [];
  searchControl = new FormControl('');
  docForm: FormGroup;
  isSaving: boolean = false;
  isEditingMode: boolean = false;
  selectedDoc: HubDocument = this.emptyDoc();
  selectedFile: File | null = null;

  constructor(
    private docsService: DocumentsService,
    private fb: FormBuilder
  ) {
    this.docForm = this.fb.group({
      title: ['', Validators.required],
      category: ['Altro'],
      tags: [''],
      notes: ['']
    });
  }

  ngOnInit() {
    this.loadDocuments();
    this.searchControl.valueChanges.subscribe(() => {
      this.loadDocuments();
    });
  }

  loadDocuments() {
    this.docsService.getDocuments(this.searchControl.value || '').subscribe(docs => {
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
    this.docForm.reset({
      title: '',
      category: 'Altro',
      tags: '',
      notes: ''
    });
    this.isEditingMode = true;
    this.selectedFile = null;
  }

  selectDoc(doc: HubDocument) {
    this.selectedDoc = { ...doc };
    this.docForm.patchValue({
      title: doc.title,
      category: doc.category,
      tags: doc.tags,
      notes: doc.notes
    });
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
    if (this.docForm.invalid) return;
    this.isSaving = true;

    const formValues = this.docForm.value;
    const formData = new FormData();
    if (this.selectedDoc.id) formData.append('id', this.selectedDoc.id.toString());
    formData.append('title', formValues.title);
    formData.append('category', formValues.category || '');
    formData.append('tags', formValues.tags || '');
    formData.append('notes', formValues.notes || '');
    
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
