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
    attachment_id: 8, attachment_name: 'contratto.pdf', attachment_mime: 'application/pdf',
    attachment_size: 2048, can_edit: true
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
    expect(text).toContain('Apri');
    expect(text).toContain('Scarica');
    expect(text).not.toContain('Mostra archivio');
  });

  it('requires a file for creation and submits metadata plus upload from a modal', async () => {
    const { fixture, post } = await createFixture();
    (fixture.nativeElement.querySelector('.document-page-heading .primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.document-editor-modal')).not.toBeNull();
    fixture.componentInstance.form.setValue({
      title: 'Garanzia frigorifero', category: 'Garanzie', notes: 'Scade nel 2028'
    });
    const file = new File(['png'], 'garanzia.png', { type: 'image/png' });
    fixture.componentInstance.selectedFile.set(file);
    fixture.componentInstance.save();
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0] as [string, unknown];
    expect(url).toBe('api/v1/documents');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('title')).toBe('Garanzia frigorifero');
    expect((body as FormData).get('category')).toBe('Garanzie');
    const uploaded = (body as FormData).get('file') as File;
    expect(uploaded.name).toBe('garanzia.png');
    expect(uploaded.type).toBe('image/png');
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
