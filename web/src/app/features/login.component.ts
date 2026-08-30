import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { SESSION_EXPIRED_REASON } from '../core/session-expiry.service';
import { SessionStore } from '../core/session.store';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="auth-card card" aria-labelledby="login-title">
      <p class="eyebrow">Spazio familiare privato</p>
      <h1 id="login-title">Bentornato</h1>
      <p class="muted">Accedi per ritrovare attività, pasti e progetti di casa.</p>
      @if (sessionExpired) {
        <p class="session-expired" role="status">La sessione è scaduta. Accedi nuovamente.</p>
      }
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label>Nome utente<input autocomplete="username" formControlName="username"></label>
        <label>Password<input type="password" autocomplete="current-password" formControlName="password"></label>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <button class="primary" type="submit" [disabled]="form.invalid || busy() || !sessionReady()">
          {{ !sessionReady() ? 'Preparazione…' : (busy() ? 'Accesso…' : 'Accedi') }}
        </button>
      </form>
    </section>
  `
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(SessionStore);
  readonly sessionExpired = this.route.snapshot.queryParamMap.get('reason') === SESSION_EXPIRED_REASON;
  readonly busy = signal(false);
  readonly sessionReady = signal(false);
  readonly error = signal('');
  readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });

  constructor() {
    this.auth.ensureSession(true).subscribe({
      next: (active) => {
        if (active) {
          void this.router.navigate(['/']);
          return;
        }
        if (this.store.csrfToken() === '') {
          this.error.set('Impossibile inizializzare la sessione. Ricarica la pagina e riprova.');
          return;
        }
        this.sessionReady.set(true);
      },
      error: () => this.error.set('Impossibile inizializzare la sessione. Ricarica la pagina e riprova.')
    });
  }

  submit(): void {
    if (this.form.invalid || this.busy() || !this.sessionReady()) return;
    this.busy.set(true);
    this.error.set('');
    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password).subscribe({
      next: () => void this.router.navigate(['/']),
      error: () => {
        this.busy.set(false);
        this.error.set('Credenziali non valide o troppi tentativi.');
      }
    });
  }
}
