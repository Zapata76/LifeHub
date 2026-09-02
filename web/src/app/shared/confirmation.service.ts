import { Injectable, signal } from '@angular/core';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface ConfirmationState extends ConfirmationOptions {
  resolve: (confirmed: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  readonly current = signal<ConfirmationState | null>(null);

  confirm(options: ConfirmationOptions): Promise<boolean> {
    this.settle(false);
    return new Promise((resolve) => this.current.set({ ...options, resolve }));
  }

  settle(confirmed: boolean): void {
    const request = this.current();
    if (!request) return;
    this.current.set(null);
    request.resolve(confirmed);
  }
}
