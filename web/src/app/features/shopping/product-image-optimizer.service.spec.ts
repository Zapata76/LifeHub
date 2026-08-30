import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_IMAGE_JPEG_QUALITY,
  PRODUCT_IMAGE_MAX_EDGE,
  ProductImageOptimizer
} from './product-image-optimizer.service';

describe('ProductImageOptimizer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resizes a large photo, flattens it on white, and emits a smaller JPEG', async () => {
    const close = vi.fn();
    const bitmap = { width: 2400, height: 1200, close } as unknown as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const context = {
      fillStyle: '',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fillRect: vi.fn(),
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback: BlobCallback, type?: string, quality?: number) => {
        expect(type).toBe('image/jpeg');
        expect(quality).toBe(PRODUCT_IMAGE_JPEG_QUALITY);
        callback(new Blob([new Uint8Array(128)], { type: 'image/jpeg' }));
      }
    );
    const original = new File([new Uint8Array(2048)], 'Scatto.PNG', {
      type: 'image/png',
      lastModified: 123
    });

    const optimized = await new ProductImageOptimizer().optimize(original);

    const canvas = toBlob.mock.instances[0] as HTMLCanvasElement;
    expect(canvas.width).toBe(PRODUCT_IMAGE_MAX_EDGE);
    expect(canvas.height).toBe(480);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 960, 480);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 960, 480);
    expect(optimized).not.toBe(original);
    expect(optimized.name).toBe('Scatto.jpg');
    expect(optimized.type).toBe('image/jpeg');
    expect(optimized.size).toBe(128);
    expect(optimized.lastModified).toBe(123);
    expect(close).toHaveBeenCalled();
  });

  it('keeps the original when JPEG conversion would increase its network size', async () => {
    const bitmap = { width: 400, height: 300, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const context = { fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => {
      callback(new Blob([new Uint8Array(256)], { type: 'image/jpeg' }));
    });
    const original = new File([new Uint8Array(64)], 'small.jpg', { type: 'image/jpeg' });

    await expect(new ProductImageOptimizer().optimize(original)).resolves.toBe(original);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('converts a decodable mobile format even when JPEG is not smaller', async () => {
    const bitmap = { width: 800, height: 600, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const context = { fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => {
      callback(new Blob([new Uint8Array(256)], { type: 'image/jpeg' }));
    });
    const original = new File([new Uint8Array(64)], 'camera.heic', { type: 'image/heic' });

    const optimized = await new ProductImageOptimizer().optimize(original);

    expect(optimized).not.toBe(original);
    expect(optimized.name).toBe('camera.jpg');
    expect(optimized.type).toBe('image/jpeg');
  });
});
