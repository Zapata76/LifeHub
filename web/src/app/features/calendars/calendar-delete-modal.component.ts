import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output, signal } from '@angular/core';
import { CalendarApiService } from './calendar-api.service';
import { CalendarItem } from './calendar.models';

@Component({
  selector: 'lh-calendar-delete-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="calendar-modal-backdrop" (mousedown)="backdropClick($event)">
      <section class="card calendar-modal calendar-delete-modal" role="alertdialog" aria-modal="true"
        aria-labelledby="calendar-delete-title" aria-describedby="calendar-delete-description">
        <h2 id="calendar-delete-title">Elimina calendario</h2>
        <div class="calendar-modal-body single-column">
          <p id="calendar-delete-description">
            Vuoi eliminare definitivamente il calendario <strong>{{ calendar.name }}</strong>?
            Verranno eliminate anche tutte le associazioni con gli utenti. L’operazione non può essere annullata.
          </p>
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        </div>
        <footer class="calendar-modal-footer">
          <button class="quiet" type="button" (click)="close()" [disabled]="busy()">Annulla</button>
          <span class="modal-spacer"></span>
          <button class="danger" type="button" (click)="confirm()" [disabled]="busy()">
            {{ busy() ? 'Eliminazione…' : 'Elimina definitivamente' }}
          </button>
        </footer>
      </section>
    </div>
  `
})
export class CalendarDeleteModalComponent {
  @Input({ required: true }) calendar!: CalendarItem;
  @Output() readonly dismissed = new EventEmitter<void>();
  @Output() readonly deleted = new EventEmitter<void>();
  readonly busy = signal(false);
  readonly error = signal('');

  constructor(private readonly api: CalendarApiService) {}

  @HostListener('document:keydown.escape')
  close(): void {
    if (!this.busy()) this.dismissed.emit();
  }

  backdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  confirm(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.delete(this.calendar).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleted.emit();
      },
      error: (failure: unknown) => {
        const code = failure instanceof HttpErrorResponse ? failure.error?.error?.code : null;
        this.error.set(code === 'version.conflict'
          ? 'Il calendario è stato modificato. Chiudi la finestra, ricarica e riprova.'
          : 'Impossibile eliminare il calendario. Riprova.');
        this.busy.set(false);
      }
    });
  }
}
