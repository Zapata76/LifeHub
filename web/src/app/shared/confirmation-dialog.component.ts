import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { ModalBackdropDirective } from './modal-backdrop.directive';
import { ConfirmationService } from './confirmation.service';

@Component({
  selector: 'lh-confirmation-dialog',
  standalone: true,
  imports: [ModalBackdropDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Styles live in the external core stylesheet: production CSP forbids inline styles.
  template: `
    @if (confirmation.current(); as request) {
      <div class="confirmation-backdrop" lhModalBackdrop
        (backdropDismissed)="confirmation.settle(false)">
        <section class="card confirmation-dialog" role="alertdialog" aria-modal="true"
          aria-labelledby="confirmation-title" aria-describedby="confirmation-message">
          <h2 id="confirmation-title">{{ request.title }}</h2>
          <p id="confirmation-message">{{ request.message }}</p>
          <footer>
            <button type="button" autofocus (click)="confirmation.settle(false)">Annulla</button>
            <button type="button" [class.danger]="request.danger"
              (click)="confirmation.settle(true)">{{ request.confirmLabel ?? 'Conferma' }}</button>
          </footer>
        </section>
      </div>
    }
  `
})
export class ConfirmationDialogComponent {
  readonly confirmation = inject(ConfirmationService);

  @HostListener('document:keydown.escape')
  close(): void { this.confirmation.settle(false); }
}
