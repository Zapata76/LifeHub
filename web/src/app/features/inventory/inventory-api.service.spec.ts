import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InventoryApiService } from './inventory-api.service';

describe('InventoryApiService images', () => {
  let api: InventoryApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    api = TestBed.inject(InventoryApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uploads every selected image as an inventory attachment', () => {
    const first = new File(['front'], 'fronte.jpg', { type: 'image/jpeg' });
    const second = new File(['back'], 'retro.png', { type: 'image/png' });

    api.uploadImage(42, first).subscribe();
    api.uploadImage(42, second).subscribe();

    const uploads = http.match('api/v1/attachments');
    expect(uploads).toHaveLength(2);
    expect(uploads.map(({ request }) => (request.body as FormData).get('file'))).toEqual([first, second]);
    for (const upload of uploads) {
      const body = upload.request.body as FormData;
      expect(body.get('ownerType')).toBe('inventory');
      expect(body.get('ownerId')).toBe('42');
      upload.flush({ item: { id: 1 } });
    }
  });

  it('deletes only the chosen image using the current item version', () => {
    api.deleteImage(42, 9, 3).subscribe();

    const deletion = http.expectOne('api/v1/inventory/42/images/9');
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.body).toEqual({ version: 3 });
    deletion.flush({ deleted: true });
  });

  it('loads the archive and sends versioned restore and permanent-delete commands', () => {
    api.overview(true).subscribe();
    const archive = http.expectOne('api/v1/inventory/overview?archived=1');
    expect(archive.request.method).toBe('GET');
    archive.flush({
      items: [], categories: [], members: [], documents: [], can_manage: true,
      active_count: 2, archived_count: 1
    });

    api.restore(42, 4).subscribe();
    const restore = http.expectOne('api/v1/inventory/42/restore');
    expect(restore.request.method).toBe('POST');
    expect(restore.request.body).toEqual({ version: 4 });
    restore.flush({ restored: true });

    api.deleteItem(42, 6).subscribe();
    const deletion = http.expectOne('api/v1/inventory/42');
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.body).toEqual({ version: 6 });
    deletion.flush({ deleted: true });
  });

  it('creates, renames, and deletes configurable categories with versions and impact', () => {
    api.createCategory('Cantina').subscribe((id) => expect(id).toBe(8));
    const creation = http.expectOne('api/v1/inventory/categories');
    expect(creation.request.method).toBe('POST');
    expect(creation.request.body).toEqual({ name: 'Cantina' });
    creation.flush({ id: 8 });

    api.updateCategory(8, 2, 'Casa e cantina').subscribe();
    const update = http.expectOne('api/v1/inventory/categories/8');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ name: 'Casa e cantina', version: 2 });
    update.flush({ updated: true });

    api.deleteCategory(8, 3).subscribe((moved) => expect(moved).toBe(4));
    const deletion = http.expectOne('api/v1/inventory/categories/8');
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.body).toEqual({ version: 3 });
    deletion.flush({ deleted: true, movedItems: 4 });
  });
});
