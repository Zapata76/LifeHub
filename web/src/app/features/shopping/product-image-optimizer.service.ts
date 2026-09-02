/** Produces compact product photos before upload. */

import { Injectable } from '@angular/core';
import { ImageOptimizer } from '../../shared/image-optimizer.service';

export const PRODUCT_IMAGE_MAX_EDGE = 960;
export const PRODUCT_IMAGE_JPEG_QUALITY = 0.78;

@Injectable({ providedIn: 'root' })
export class ProductImageOptimizer extends ImageOptimizer {
  override optimize(file: File): Promise<File> {
    return super.optimize(file, {
      maxEdge: PRODUCT_IMAGE_MAX_EDGE,
      jpegQuality: PRODUCT_IMAGE_JPEG_QUALITY,
      fallbackName: 'prodotto'
    });
  }
}
