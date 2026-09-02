import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { SessionStore } from './core/session.store';
import { ConfirmationDialogComponent } from './shared/confirmation-dialog.component';

@Component({
  selector: 'lh-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmationDialogComponent],
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
          <button class="quiet" type="button" (click)="logout()">Esci</button>
        </div>
      } @else {
        <a routerLink="/about">About</a>
      }
    </header>
    @if (!online()) {
      <div class="offline" role="status">Sei offline. I dati protetti non vengono salvati nella cache.</div>
    }
    <main id="main" tabindex="-1"><router-outlet /></main>
    <lh-confirmation-dialog />
  `
})
export class AppComponent implements OnDestroy {
  readonly store = inject(SessionStore);
  readonly siteName = signal('Life Hub');
  readonly online = signal(navigator.onLine);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly onlineListener = () => this.online.set(true);
  private readonly offlineListener = () => this.online.set(false);

  constructor() {
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
