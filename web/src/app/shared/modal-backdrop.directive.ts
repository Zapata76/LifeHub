import { Directive, EventEmitter, HostListener, Output } from '@angular/core';

/** Emits a dismissal only when a mouse interaction starts on the backdrop itself. */
@Directive({
  selector: '[lhModalBackdrop]',
  standalone: true
})
export class ModalBackdropDirective {
  @Output() readonly backdropDismissed = new EventEmitter<void>();

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.backdropDismissed.emit();
  }
}
