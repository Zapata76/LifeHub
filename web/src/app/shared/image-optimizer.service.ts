/** Resizes browser-decodable photos before upload using feature-specific quality profiles. */

import { Injectable } from '@angular/core';

export interface ImageOptimizationProfile {
  maxEdge: number;
  jpegQuality: number;
  fallbackName: string;
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

@Injectable({ providedIn: 'root' })
export class ImageOptimizer {
  async optimize(file: File, profile: ImageOptimizationProfile): Promise<File> {
    let decoded: DecodedImage | null = null;
    try {
      decoded = await this.decode(file);
      if (decoded.width < 1 || decoded.height < 1) return file;

      const scale = Math.min(1, profile.maxEdge / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return file;

      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(decoded.source, 0, 0, width, height);

      const blob = await this.toJpeg(canvas, profile.jpegQuality);
      const serverAcceptsOriginal = ['image/jpeg', 'image/png'].includes(file.type);
      if (serverAcceptsOriginal && blob.size >= file.size) return file;

      return new File([blob], this.jpegName(file.name, profile.fallbackName), {
        type: 'image/jpeg',
        lastModified: file.lastModified
      });
    } catch {
      return file;
    } finally {
      decoded?.dispose();
    }
  }

  private async decode(file: File): Promise<DecodedImage> {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          dispose: () => bitmap.close()
        };
      } catch {
        // Some mobile formats are only decodable through the browser image element.
      }
    }
    return this.decodeWithImageElement(file);
  }

  private decodeWithImageElement(file: File): Promise<DecodedImage> {
    const objectUrl = URL.createObjectURL(file);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: () => URL.revokeObjectURL(objectUrl)
      });
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('The selected image cannot be decoded.'));
      };
      image.src = objectUrl;
    });
  }

  private toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob || blob.type !== 'image/jpeg') {
          reject(new Error('The image cannot be encoded as JPEG.'));
          return;
        }
        resolve(blob);
      }, 'image/jpeg', quality);
    });
  }

  private jpegName(name: string, fallback: string): string {
    const base = name.replace(/\.[^.]+$/, '').trim() || fallback;
    return `${base}.jpg`;
  }
}
