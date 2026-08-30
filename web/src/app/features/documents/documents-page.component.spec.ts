import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsPageComponent } from './documents-page.component';

const overview = {
  documents: [{
    id: 4, title: 'Contratto affitto', description: 'Rinnovo annuale', category_text: 'Contratti',
    visibility: 'private', owner_id: 1, owner_name: 'Emiliano',
    created_at: '2026-07-19 10:00:00', updated_at: '2026-07-19 10:00:00', version: 1,
    attachments: [
      { id: 8, name: 'contratto.pdf', mime: 'application/pdf', size: 2048 },
      { id: 9, name: 'fronte.jpg', mime: 'image/jpeg', size: 1024 },
      { id: 10, name: 'retro.jpg', mime: 'image/jpeg', size: 1024 }
    ],
    attachment_id: 10, attachment_name: 'retro.jpg', attachment_mime: 'image/jpeg',
    attachment_size: 1024, can_edit: true
  }],
  categories: ['Contratti'], can_manage: true
};

describe('DocumentsPageComponent', () => {
  async function createFixture() {
    const get = vi.fn(() => of(overview));
    const post = vi.fn((url: string, _body?: unknown) => of(url === 'api/v1/documents' ? { id: 5 } : { updated: true }));
    const remove = vi.fn(() => of({ deleted: true }));
    await TestBed.configureTestingModule({
      imports: [DocumentsPageComponent],
      providers: [{ provide: HttpClient, useValue: { get, post, delete: remove } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(DocumentsPageComponent);
    fixture.detectChanges();
    return { fixture, get, post, remove };
  }

  it('renders master-detail metadata and private file actions', async () => {
    const { fixture } = await createFixture();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Archivio documenti');
    expect(text).toContain('Contratto affitto');
    expect(text).toContain('Contratti');
    expect(text).toContain('Rinnovo annuale');
    expect(text).toContain('contratto.pdf');
    expect(text).toContain('fronte.jpg');
    expect(text).toContain('retro.jpg');
    expect(fixture.nativeElement.querySelectorAll('.document-file-card')).toHaveLength(3);
    expect(text).toContain('Apri');
    expect(text).toContain('Scarica');
    expect(fixture.nativeElement.querySelectorAll('.document-preview-action')).toHaveLength(3);
    expect(text).not.toContain('Mostra archivio');
  });

  it('requires a file for creation and submits metadata plus upload from a modal', async () => {
    const { fixture, post } = await createFixture();
    (fixture.nativeElement.querySelector('.document-page-heading .primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.document-editor-modal')).not.toBeNull();
    const uploadInput = fixture.nativeElement.querySelector('.document-upload-input') as HTMLInputElement;
    expect(uploadInput.hidden).toBe(false);
    expect(uploadInput.getAttribute('aria-label')).toBe('Seleziona i file del documento');
    fixture.componentInstance.form.setValue({
      title: 'Garanzia frigorifero', category: 'Garanzie', notes: 'Scade nel 2028'
    });
    const file = new File(['png'], 'garanzia.png', { type: 'image/png' });
    const pdf = new File(['pdf'], 'garanzia.pdf', { type: 'application/pdf' });
    fixture.componentInstance.selectedFiles.set([file, pdf]);
    fixture.componentInstance.save();
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0] as [string, unknown];
    expect(url).toBe('api/v1/documents');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('title')).toBe('Garanzia frigorifero');
    expect((body as FormData).get('category')).toBe('Garanzie');
    const uploaded = (body as FormData).getAll('files[]') as File[];
    expect(uploaded.map((item) => item.name)).toEqual(['garanzia.png', 'garanzia.pdf']);
    expect(uploaded.map((item) => item.type)).toEqual(['image/png', 'application/pdf']);
  });

  it('previews images and PDFs inside the document UI', async () => {
    const { fixture } = await createFixture();
    const previewButtons = fixture.nativeElement.querySelectorAll('.document-preview-action') as NodeListOf<HTMLButtonElement>;

    previewButtons[1].click();
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('.document-preview-body img') as HTMLImageElement;
    expect(image).not.toBeNull();
    expect(image.getAttribute('src')).toBe('api/v1/attachments/9/download?inline=1');

    fixture.componentInstance.closePreview();
    previewButtons[0].click();
    fixture.detectChanges();
    const frame = fixture.nativeElement.querySelector('.document-preview-body iframe') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('src')).toBe('api/v1/attachments/8/download?inline=1');
  });

  it('confirms and deletes only the selected document file', async () => {
    const { fixture, remove } = await createFixture();
    const deleteButtons = fixture.nativeElement.querySelectorAll('.document-file-delete') as NodeListOf<HTMLButtonElement>;
    deleteButtons[1].click();
    fixture.detectChanges();

    const modal = fixture.nativeElement.querySelector('.document-delete-modal') as HTMLElement;
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('fronte.jpg');
    expect(modal.textContent).toContain('Contratto affitto');

    fixture.componentInstance.deleteAttachment();
    expect(remove).toHaveBeenCalledWith('api/v1/documents/4/attachments/9', { body: { version: 1 } });
  });

  it('uses a confirmation modal before permanent deletion', async () => {
    const { fixture, remove } = await createFixture();
    (fixture.nativeElement.querySelector('.document-detail-header .danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.document-delete-modal')).not.toBeNull();
    fixture.componentInstance.deleteDocument();
    expect(remove).toHaveBeenCalledWith('api/v1/documents/4', { body: { version: 1 } });
  });
});
