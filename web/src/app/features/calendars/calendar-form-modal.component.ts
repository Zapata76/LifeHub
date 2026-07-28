import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CalendarApiService } from './calendar-api.service';
import { CalendarItem } from './calendar.models';

@Component({
  selector: 'lh-calendar-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="calendar-modal-backdrop" (mousedown)="backdropClick($event)">
      <section class="card calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-modal-title">
        <h2 id="calendar-modal-title">Nuovo calendario Google</h2>
        @if (error()) { <p class="error calendar-modal-error" role="alert">{{ error() }}</p> }
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="calendar-modal-body">
            <label>Nome
              <input formControlName="name" autocomplete="off" placeholder="Es. Famiglia" autofocus>
            </label>
            <label>ID Google Calendar
              <input formControlName="externalId" autocomplete="off" placeholder="ID o indirizzo del calendario">
            </label>
          </div>
          <footer class="calendar-modal-footer">
            <button class="quiet" type="button" (click)="close()" [disabled]="busy()">Annulla</button>
            <span class="modal-spacer"></span>
            <button class="primary" type="submit" [disabled]="form.invalid || busy()">
              {{ busy() ? 'Salvataggio…' : 'Aggiungi calendario' }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  `
})
export class CalendarFormModalComponent {
  @Output() readonly dismissed = new EventEmitter<void>();
  @Output() readonly created = new EventEmitter<CalendarItem>();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    externalId: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });

  constructor(private readonly api: CalendarApiService) {}

  @HostListener('document:keydown.escape')
  close(): void {
    if (!this.busy()) this.dismissed.emit();
  }

  backdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  save(): void {
    if (this.form.invalid || this.busy()) return;
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.api.create({ name: value.name.trim(), external_id: value.externalId.trim() }).subscribe({
      next: ({ item }) => {
        this.busy.set(false);
        this.created.emit(item);
      },
      error: (failure: unknown) => {
        const code = failure instanceof HttpErrorResponse ? failure.error?.error?.code : null;
        this.error.set(code === 'authorization.denied'
          ? 'Solo un amministratore può aggiungere calendari.'
          : 'Impossibile aggiungere il calendario. Controlla nome e ID Google.');
        this.busy.set(false);
      }
    });
  }
}
