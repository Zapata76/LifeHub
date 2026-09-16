import { ChangeDetectionStrategy, Component, ElementRef, HostListener, afterRenderEffect, inject, viewChild } from '@angular/core';
import { PushNotificationsService } from '../core/push-notifications.service';
import { ModalBackdropDirective } from './modal-backdrop.directive';

@Component({
  selector: 'lh-push-settings',
  standalone: true,
  imports: [ModalBackdropDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (push.settingsOpen()) {
      <div class="push-backdrop" lhModalBackdrop (backdropDismissed)="close()">
        <section #panel class="card push-settings" role="dialog" aria-modal="true" aria-labelledby="push-title">
          <h2 id="push-title">Notifiche su questo dispositivo</h2>
          <p>Ricevi un avviso quando un altro utente della famiglia completa un’attività,
            anche quando l’app non è aperta.</p>
          <p class="muted">Attiva le notifiche su ciascun dispositivo che vuoi usare.
            Il titolo dell’attività può comparire sulla schermata di blocco. Uscendo con “Esci”,
            le notifiche di questo dispositivo vengono disattivate.</p>
          @if (!push.supported) {
            <p role="status">Notifiche non disponibili in questo browser. Su iPhone o iPad (iOS 16.4 o successivi),
              aggiungi Life Hub alla schermata Home da Safari e apri l’app da lì.
              Su altri dispositivi usa un browser aggiornato e una connessione HTTPS.</p>
          } @else if (push.busy()) {
            <p role="status">Verifica delle notifiche in corso…</p>
          } @else if (!push.configured()) {
            <p role="status">Le notifiche push non sono ancora configurate sul server. Contatta l’amministratore.</p>
          } @else if (push.permission() === 'denied') {
            <p role="status">Le notifiche sono bloccate. Puoi consentirle dalle impostazioni del browser o del dispositivo.</p>
          } @else if (push.active()) {
            <p class="success" role="status">Notifiche attive su questo dispositivo.</p>
          } @else {
            <p role="status">Notifiche non attive su questo dispositivo.</p>
          }
          @if (push.error()) { <p class="error" role="alert">{{ push.error() }}</p> }
          <div class="actions">
            <button type="button" (click)="close()">Chiudi</button>
            @if (push.supported) {
              @if (push.active() || push.endpoint()) {
                <button type="button" [disabled]="push.busy()" (click)="push.disable()">Disattiva qui</button>
              } @else {
                <button type="button" class="primary"
                  [disabled]="push.busy() || !push.configured() || push.permission() === 'denied'"
                  (click)="push.enable()">Attiva notifiche</button>
              }
            }
          </div>
        </section>
      </div>
    }
  `
})
export class PushSettingsComponent {
  readonly push = inject(PushNotificationsService);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    afterRenderEffect(() => this.panel()?.nativeElement.querySelector<HTMLButtonElement>('button')?.focus());
  }

  @HostListener('document:keydown', ['$event'])
  trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.push.settingsOpen()) return;
    const buttons = this.panel()?.nativeElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    if (!buttons?.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const active = document.activeElement;
    if ((event.shiftKey && active === first) || (!event.shiftKey && active === last)
      || !this.panel()?.nativeElement.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (!this.push.settingsOpen()) return;
    this.push.settingsOpen.set(false);
    document.querySelector<HTMLButtonElement>('[data-push-trigger]')?.focus();
  }
}
