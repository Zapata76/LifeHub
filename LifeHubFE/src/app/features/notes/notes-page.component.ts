import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NotesService, Note } from './notes.service';

@Component({
  selector: 'app-notes-page',
  templateUrl: './notes-page.component.html',
  styleUrls: ['./notes-page.component.css']
})
export class NotesPageComponent implements OnInit {
  notes: Note[] = [];
  editingNote: Note | null = null;
  noteForm: FormGroup;
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  isSaving = false;
  userAuthor: string = '';
  colors = ['#1e1e1e', '#2c3e50', '#8e44ad', '#2980b9', '#27ae60', '#d35400', '#c0392b'];

  constructor(
    private notesService: NotesService,
    private fb: FormBuilder
  ) {
    this.noteForm = this.fb.group({
      title: [''],
      content: [''],
      color: ['#1e1e1e'],
      is_pinned: [false]
    });
  }

  ngOnInit() {
    this.loadNotes();
    // In a real case I would use an auth service, here we simulate from the first note load
  }

  loadNotes() {
    this.notesService.getNotes().subscribe(data => {
      this.notes = data.map(n => ({
        ...n,
        is_pinned: Number(n.is_pinned) === 1
      }));
      if (this.notes.length > 0 && !this.userAuthor) {
          // Small shortcut to show a username in the header without creating another service
          // (This will be improved when we have a centralized user service)
      }
    });
  }

  createNewNote() {
    this.editingNote = { title: '', content: '', color: '#1e1e1e', is_pinned: 0 };
    this.noteForm.reset({
      title: '',
      content: '',
      color: '#1e1e1e',
      is_pinned: false
    });
    this.previewUrl = null;
    this.selectedFile = null;
  }

  editNote(note: Note) {
    this.editingNote = { ...note };
    this.noteForm.patchValue({
      title: note.title,
      content: note.content,
      color: note.color || '#1e1e1e',
      is_pinned: !!note.is_pinned
    });
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
    if (!this.editingNote || (this.noteForm.get('title')?.value === '' && this.noteForm.get('content')?.value === '')) return;
    this.isSaving = true;

    const formValues = this.noteForm.value;
    const formData = new FormData();
    if (this.editingNote.id) formData.append('id', this.editingNote.id.toString());
    formData.append('title', formValues.title || '');
    formData.append('content', formValues.content || '');
    formData.append('color', formValues.color || '#1e1e1e');
    formData.append('is_pinned', (formValues.is_pinned ? 1 : 0).toString());
    
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
      this.notesService.deleteNote(note.id!).subscribe(() => {
        this.editingNote = null;
        this.loadNotes();
      });
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

