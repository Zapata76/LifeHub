import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { SessionStore } from './core/session.store';
import { SessionExpiryService } from './core/session-expiry.service';
import { AppUpdateService } from './core/app-update.service';
import { ConfirmationDialogComponent } from './shared/confirmation-dialog.component';
import { PushSettingsComponent } from './shared/push-settings.component';
import { PushNotificationsService } from './core/push-notifications.service';

@Component({
  selector: 'lh-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmationDialogComponent, PushSettingsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Vai al contenuto</a>
    <header class="app-header">
      <a class="brand" routerLink="/" [attr.aria-label]="siteName() + ', home'">
        <img src="icons/icon-48x48.png" width="26" height="26" alt="" aria-hidden="true"> {{ siteName() }}
      </a>
      @if (store.authenticated()) {
        <nav aria-label="Navigazione principale">
          <a routerLink="/tasks" routerLinkActive="active">Attività</a>
          <a routerLink="/shopping" routerLinkActive="active">Spesa</a>
          <a routerLink="/recipes" routerLinkActive="active">Ricette</a>
        </nav>
        <div class="account">
          <span>{{ store.user()?.username }}</span>
          <button class="quiet" type="button" data-push-trigger aria-label="Notifiche su questo dispositivo"
            title="Notifiche su questo dispositivo" [attr.aria-expanded]="push.settingsOpen()"
            (click)="push.openSettings()">
            <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
            </svg>
          </button>
          <button class="quiet" type="button" (click)="logout()">Esci</button>
        </div>
      } @else {
        <a routerLink="/about">About</a>
      }
    </header>
    @if (!online()) {
      <div class="offline" role="status">Sei offline. I dati protetti non vengono salvati nella cache.</div>
    }
    @if (updates.ready()) {
      <div class="app-update-notice" role="status" aria-live="polite" aria-atomic="true">
        <div class="app-update-copy">
          <strong>Nuova versione disponibile</strong>
          <span id="app-update-hint">L’aggiornamento ricarica la pagina: salva eventuali modifiche prima di procedere.</span>
        </div>
        <button class="primary" type="button" aria-describedby="app-update-hint"
          (click)="updates.apply()" [disabled]="updates.requests() > 0 || !online()">
          Aggiorna ora
        </button>
      </div>
    }
    <main id="main" tabindex="-1"><router-outlet /></main>
    <lh-confirmation-dialog />
    <lh-push-settings />
  `
})
export class AppComponent implements OnDestroy {
  readonly store = inject(SessionStore);
  readonly updates = inject(AppUpdateService);
  readonly push = inject(PushNotificationsService);
  private readonly sessionExpiry = inject(SessionExpiryService);
  readonly siteName = signal('Life Hub');
  readonly online = signal(navigator.onLine);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly onlineListener = () => this.online.set(true);
  private readonly offlineListener = () => this.online.set(false);

  constructor() {
    this.updates.start();
    this.sessionExpiry.start();
    window.addEventListener('online', this.onlineListener);
    window.addEventListener('offline', this.offlineListener);
    this.http.get<{ siteName: string }>('api/v1/app-config').subscribe({
      next: ({ siteName }) => {
        const configured = siteName.trim();
        if (configured !== '') {
          this.siteName.set(configured);
          document.title = configured;
        }
      },
      error: () => undefined
    });
  }

  logout(): void {
    this.auth.logout().subscribe({ next: () => void this.router.navigate(['/login']) });
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onlineListener);
    window.removeEventListener('offline', this.offlineListener);
  }
}
