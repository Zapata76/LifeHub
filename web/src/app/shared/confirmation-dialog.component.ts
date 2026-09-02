import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { ModalBackdropDirective } from './modal-backdrop.directive';
import { ConfirmationService } from './confirmation.service';

@Component({
  selector: 'lh-confirmation-dialog',
  standalone: true,
  imports: [ModalBackdropDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .confirmation-backdrop { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center;
      padding: 1rem; background: #020617d9; backdrop-filter: blur(5px); }
    .confirmation-dialog { width: min(100%, 32rem); padding: 1.5rem; border-top: 5px solid #fb7185; }
    .confirmation-dialog h2 { margin-top: 0; color: #fb7185; }
    .confirmation-dialog p { color: var(--muted); white-space: pre-line; }
    .confirmation-dialog footer { display: flex; justify-content: flex-end; gap: .75rem; margin-top: 1.5rem; }
  `],
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
