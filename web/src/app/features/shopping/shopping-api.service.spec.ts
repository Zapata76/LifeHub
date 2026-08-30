import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductImageOptimizer } from './product-image-optimizer.service';
import { ShoppingApiService } from './shopping-api.service';

describe('ShoppingApiService product images', () => {
  let api: ShoppingApiService;
  let http: HttpTestingController;
  const optimized = new File(['optimized'], 'prodotto.jpg', { type: 'image/jpeg' });
  const optimizer = { optimize: vi.fn(() => Promise.resolve(optimized)) };

  beforeEach(() => {
    optimizer.optimize.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProductImageOptimizer, useValue: optimizer }
      ]
    });
    api = TestBed.inject(ShoppingApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uploads the optimized file after creating a product', async () => {
    const original = new File(['large original'], 'camera.png', { type: 'image/png' });
    let completed = false;
    api.createProduct('Biscotti', 7, original).subscribe(() => { completed = true; });

    const creation = http.expectOne('api/v1/products');
    expect(creation.request.method).toBe('POST');
    expect(creation.request.body).toEqual({ name: 'Biscotti', category_id: 7 });
    creation.flush({ item: { id: 42, version: 1 } });

    await vi.waitFor(() => expect(optimizer.optimize).toHaveBeenCalledWith(original));
    const upload = http.expectOne('api/v1/attachments');
    const body = upload.request.body as FormData;
    expect(upload.request.method).toBe('POST');
    expect(body.get('ownerType')).toBe('product');
    expect(body.get('ownerId')).toBe('42');
    expect(body.get('file')).toBe(optimized);
    upload.flush({ item: { id: 8, version: 1 } });

    expect(completed).toBe(true);
  });
});
