import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { SessionStore } from '../core/session.store';
import { CalendarDeleteModalComponent } from './calendars/calendar-delete-modal.component';
import { CalendarFormModalComponent } from './calendars/calendar-form-modal.component';
import { CalendarItem } from './calendars/calendar.models';

type UserRole = 'admin' | 'adult' | 'child';
type UserStatus = 'active' | 'disabled';

interface ManagedUser {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  version: number;
}

interface CalendarAssignment {
  user_id: number;
  calendar_id: number;
}

interface UserDraft {
  role: UserRole;
  status: UserStatus;
  email: string;
}

interface CalendarDraft {
  name: string;
  externalId: string;
}

interface HomeSettings {
  homeEyebrow: string;
  homeTitle: string;
  version: number;
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, CalendarFormModalComponent, CalendarDeleteModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading">
      <div><p class="eyebrow">Amministrazione</p><h1>Admin</h1></div>
      <div class="management-heading-actions">
        <p class="muted">Account, ruoli, accesso e calendari condivisi.</p>
      </div>
    </div>

    @if (error() && !userModalOpen()) { <p class="error" role="alert">{{ error() }}</p> }
    @if (success()) { <p class="success" role="status">{{ success() }}</p> }

    <section class="card editor admin-home-settings" aria-labelledby="home-settings-title">
      <div><p class="eyebrow">Home</p><h2 id="home-settings-title">Testi in evidenza</h2></div>
      <form [formGroup]="homeForm" (ngSubmit)="saveHomeSettings()" class="form-grid">
        <label>Etichetta superiore
          <input formControlName="homeEyebrow" maxlength="190" placeholder="Oggi in famiglia">
        </label>
        <label>Titolo principale
          <input formControlName="homeTitle" maxlength="255" placeholder="Simona puzzona">
        </label>
        <button class="primary" type="submit" [disabled]="homeForm.invalid || busy()">
          Salva testi home
        </button>
      </form>
    </section>

    @if (userModalOpen()) {
    <div class="user-modal-backdrop" (mousedown)="userModalBackdrop($event)">
    <section class="card editor user-modal" role="dialog" aria-modal="true" aria-labelledby="new-user-title">
      <h2 id="new-user-title">Nuovo utente</h2>
      @if (error()) { <p class="error user-modal-error" role="alert">{{ error() }}</p> }
      <form [formGroup]="createForm" (ngSubmit)="createUser()" class="form-grid user-modal-body" autocomplete="off">
        <label>Username
          <input formControlName="username" autocomplete="new-username" placeholder="3-50 caratteri">
        </label>
        <label>Password iniziale
          <input type="password" formControlName="password" autocomplete="new-password" minlength="12">
          <small>Almeno 12 caratteri; verrà salvata esclusivamente con bcrypt.</small>
        </label>
        <label>Email notifiche <small>(facoltativa)</small>
          <input type="email" formControlName="email" autocomplete="email" maxlength="254"
            placeholder="nome@esempio.it">
        </label>
        <label>Ruolo
          <select formControlName="role">
            @for (role of roles; track role) { <option [value]="role">{{ roleLabel(role) }}</option> }
          </select>
        </label>
        <button class="quiet" type="button" (click)="closeUserModal()" [disabled]="busy()">Annulla</button>
        <button class="primary" type="submit" [disabled]="createForm.invalid || busy()">
          {{ busy() ? 'Creazione…' : 'Crea utente' }}
        </button>
      </form>
    </section>
    </div>
    }

    @if (passwordTarget(); as target) {
      <section class="card editor reset-panel" aria-labelledby="reset-password-title">
        <div>
          <p class="eyebrow">Reset controllato</p>
          <h2 id="reset-password-title">Nuova password per {{ target.username }}</h2>
        </div>
        <form [formGroup]="passwordForm" (ngSubmit)="resetPassword()" class="form-grid">
          <label>Nuova password
            <input type="password" formControlName="password" autocomplete="new-password" minlength="12">
          </label>
          <button class="primary" type="submit" [disabled]="passwordForm.invalid || busy()">Aggiorna password</button>
          <button class="quiet" type="button" (click)="closePasswordReset()">Annulla</button>
        </form>
      </section>
    }

    <section class="card editor users-admin" aria-labelledby="users-title">
      <div class="section-heading">
        <div><p class="eyebrow">Utenti</p><h2 id="users-title">Gestione utenti</h2></div>
        <div class="actions">
          <button class="primary new-user-trigger" type="button" (click)="openUserModal()" [disabled]="busy()">
            + Nuovo utente
          </button>
        </div>
      </div>
      @if (loading()) { <p class="state" role="status">Caricamento…</p> }
      @else {
        <div class="management-list">
          @for (user of users(); track user.id) {
            <article class="card management-row">
              <div class="management-identity">
                <h3>{{ user.username }}</h3>
                <span class="pill" [class.disabled-pill]="user.status === 'disabled'">
                  {{ statusLabel(user.status) }}
                </span>
                @if (isSelf(user)) { <small>Account corrente</small> }
              </div>
              <div class="management-fields">
                <label class="management-email">Email notifiche
                  <input type="email" maxlength="254" [value]="userDraft(user).email" [disabled]="busy()"
                    placeholder="Nessuna email" (input)="changeUserEmail(user, $event)">
                </label>
                <label>Ruolo
                  <select [value]="userDraft(user).role" [disabled]="isSelf(user) || busy()"
                    (change)="changeUserRole(user, $event)">
                    @for (role of roles; track role) {
                      <option [value]="role" [selected]="userDraft(user).role === role">{{ roleLabel(role) }}</option>
                    }
                  </select>
                </label>
                <label>Stato
                  <select [value]="userDraft(user).status" [disabled]="isSelf(user) || busy()"
                    (change)="changeUserStatus(user, $event)">
                    <option value="active" [selected]="userDraft(user).status === 'active'">Attivo</option>
                    <option value="disabled" [selected]="userDraft(user).status === 'disabled'">Disattivato</option>
                  </select>
                </label>
              </div>
              <fieldset class="calendar-checks">
                <legend>Calendari associati</legend>
                @if (activeCalendars().length === 0) { <small>Nessun calendario disponibile.</small> }
                @for (calendar of activeCalendars(); track calendar.id) {
                  <label>
                    <input type="checkbox" [checked]="isAssociated(user.id, calendar.id)" [disabled]="busy()"
                      (change)="toggleCalendar(user, calendar, $event)">
                    {{ calendar.name }}
                  </label>
                }
              </fieldset>
              <div class="actions management-actions">
                <button type="button" (click)="saveUser(user)" [disabled]="busy() || !validEmail(userDraft(user).email)">
                  Salva utente
                </button>
                <button type="button" (click)="openPasswordReset(user)" [disabled]="busy()">
                  Reimposta password
                </button>
                @if (!isSelf(user)) {
                  <button class="danger" type="button" (click)="toggleUserActive(user)" [disabled]="busy()">
                    {{ user.status === 'active' ? 'Disattiva' : 'Riattiva' }}
                  </button>
                }
              </div>
            </article>
          }
        </div>
      }
    </section>

    <section class="card editor calendar-admin" aria-labelledby="calendar-admin-title">
      <div class="section-heading">
        <div><p class="eyebrow">Configurazione</p><h2 id="calendar-admin-title">Anagrafica calendari Google</h2></div>
        <div class="actions">
          <button class="primary" type="button" (click)="calendarModalOpen.set(true)" [disabled]="busy()">
            + Nuovo calendario
          </button>
        </div>
      </div>
      <div class="calendar-list">
        @for (calendar of calendars(); track calendar.id) {
          <article class="calendar-editor">
            <label>Nome
              <input [value]="calendarDraft(calendar).name" [disabled]="busy()"
                (input)="changeCalendarName(calendar, $event)">
            </label>
            <label>ID Google Calendar
              <input [value]="calendarDraft(calendar).externalId" [disabled]="busy()"
                (input)="changeCalendarExternalId(calendar, $event)">
            </label>
            <div class="actions">
              <button type="button" (click)="saveCalendar(calendar)" [disabled]="busy()">Salva</button>
              <button class="danger" type="button" (click)="calendarDeleteTarget.set(calendar)" [disabled]="busy()">
                Elimina
              </button>
            </div>
          </article>
        }
      </div>
    </section>

    @if (calendarModalOpen()) {
      <lh-calendar-form-modal (dismissed)="calendarModalOpen.set(false)" (created)="calendarCreated()" />
    }
    @if (calendarDeleteTarget(); as calendar) {
      <lh-calendar-delete-modal [calendar]="calendar" (dismissed)="calendarDeleteTarget.set(null)"
        (deleted)="calendarDeleted(calendar)" />
    }
  `
})
export class UserManagementComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionStore);
  readonly roles: UserRole[] = ['admin', 'adult', 'child'];
  readonly users = signal<ManagedUser[]>([]);
  readonly calendars = signal<CalendarItem[]>([]);
  readonly assignments = signal<CalendarAssignment[]>([]);
  readonly userDrafts = signal<Record<number, UserDraft>>({});
  readonly calendarDrafts = signal<Record<number, CalendarDraft>>({});
  readonly passwordTarget = signal<ManagedUser | null>(null);
  readonly userModalOpen = signal(false);
  readonly calendarModalOpen = signal(false);
  readonly calendarDeleteTarget = signal<CalendarItem | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly homeVersion = signal(1);

  readonly createForm = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [
      Validators.required, Validators.pattern(/^[A-Za-z0-9._-]{3,50}$/)
    ] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(12)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email, Validators.maxLength(254)] }),
    role: new FormControl<UserRole>('adult', { nonNullable: true, validators: [Validators.required] })
  });
  readonly passwordForm = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(12)] })
  });
  readonly homeForm = new FormGroup({
    homeEyebrow: new FormControl('Oggi in famiglia', {
      nonNullable: true, validators: [Validators.required, Validators.maxLength(190)]
    }),
    homeTitle: new FormControl('Simona puzzona', {
      nonNullable: true, validators: [Validators.required, Validators.maxLength(255)]
    })
  });
  constructor() {
    this.load();
  }

  activeCalendars(): CalendarItem[] {
    return this.calendars();
  }

  load(): void {
    this.loading.set(true);
    forkJoin({
      users: this.http.get<{ items: ManagedUser[]; calendarAssignments: CalendarAssignment[] }>('api/v1/users'),
      calendars: this.http.get<{ items: CalendarItem[] }>('api/v1/calendars'),
      homeSettings: this.http.get<HomeSettings>('api/v1/admin/home-settings')
    }).subscribe({
      next: ({ users, calendars, homeSettings }) => {
        const normalizedUsers = users.items.map((user) => ({
          ...user, id: Number(user.id), version: Number(user.version)
        }));
        const normalizedCalendars = calendars.items.map((calendar) => ({
          ...calendar,
          id: Number(calendar.id),
          version: Number(calendar.version)
        }));
        const normalizedAssignments = users.calendarAssignments.map((assignment) => ({
          ...assignment,
          user_id: Number(assignment.user_id),
          calendar_id: Number(assignment.calendar_id)
        }));
        this.users.set(normalizedUsers);
        this.calendars.set(normalizedCalendars);
        this.assignments.set(normalizedAssignments);
        this.userDrafts.set(Object.fromEntries(normalizedUsers.map((user) => [
          user.id, { role: user.role, status: user.status, email: user.email ?? '' }
        ])));
        this.calendarDrafts.set(Object.fromEntries(normalizedCalendars.map((calendar) => [
          calendar.id, { name: calendar.name, externalId: calendar.external_id }
        ])));
        this.homeForm.setValue({
          homeEyebrow: homeSettings.homeEyebrow,
          homeTitle: homeSettings.homeTitle
        });
        this.homeVersion.set(Number(homeSettings.version));
        this.loading.set(false);
        this.busy.set(false);
      },
      error: (failure: unknown) => this.fail(failure, 'Impossibile caricare la sezione Admin.')
    });
  }

  saveHomeSettings(): void {
    if (this.homeForm.invalid) return;
    this.begin();
    const value = this.homeForm.getRawValue();
    this.http.put('api/v1/admin/home-settings', {
      homeEyebrow: value.homeEyebrow.trim(),
      homeTitle: value.homeTitle.trim(),
      version: this.homeVersion()
    }).subscribe({
      next: () => this.done('Testi della home aggiornati.'),
      error: (failure: unknown) => this.fail(failure, 'Aggiornamento dei testi della home non riuscito.')
    });
  }

  createUser(): void {
    if (this.createForm.invalid) return;
    this.begin();
    const value = this.createForm.getRawValue();
    this.http.post('api/v1/users', {
      username: value.username.trim(), password: value.password, email: value.email.trim(), role: value.role
    }).subscribe({
      next: () => {
        this.createForm.reset({ username: '', password: '', email: '', role: value.role });
        this.userModalOpen.set(false);
        this.done('Utente creato.');
      },
      error: (failure: unknown) => this.fail(failure, 'Creazione utente non riuscita.')
    });
  }

  openUserModal(): void {
    this.error.set('');
    this.success.set('');
    this.createForm.reset({ username: '', password: '', email: '', role: 'adult' });
    this.userModalOpen.set(true);
  }

  closeUserModal(): void {
    if (this.busy()) return;
    this.userModalOpen.set(false);
    this.error.set('');
    this.createForm.reset({ username: '', password: '', email: '', role: 'adult' });
  }

  userModalBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeUserModal();
  }

  saveUser(user: ManagedUser): void {
    this.begin();
    const draft = this.userDraft(user);
    this.http.put(`api/v1/users/${user.id}`, { ...draft, version: user.version }).subscribe({
      next: () => this.done('Utente aggiornato.'),
      error: (failure: unknown) => this.fail(failure, 'Aggiornamento utente non riuscito.')
    });
  }

  toggleUserActive(user: ManagedUser): void {
    const draft = this.userDraft(user);
    this.userDrafts.update((current) => ({
      ...current,
      [user.id]: { ...draft, status: user.status === 'active' ? 'disabled' : 'active' }
    }));
    this.saveUser(user);
  }

  openPasswordReset(user: ManagedUser): void {
    this.passwordTarget.set(user);
    this.passwordForm.reset({ password: '' });
  }

  closePasswordReset(): void {
    this.passwordTarget.set(null);
    this.passwordForm.reset({ password: '' });
  }

  resetPassword(): void {
    const target = this.passwordTarget();
    if (!target || this.passwordForm.invalid) return;
    this.begin();
    this.http.post(`api/v1/users/${target.id}/password`, {
      password: this.passwordForm.getRawValue().password,
      version: target.version
    }).subscribe({
      next: () => { this.closePasswordReset(); this.done('Password aggiornata con bcrypt.'); },
      error: (failure: unknown) => this.fail(failure, 'Reset password non riuscito.')
    });
  }

  toggleCalendar(user: ManagedUser, calendar: CalendarItem, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.begin();
    const action = checked ? 'assign' : 'unassign';
    this.http.post(`api/v1/users/${user.id}/calendars/${calendar.id}/${action}`, {}).subscribe({
      next: () => this.done(checked ? 'Calendario associato.' : 'Calendario scollegato.'),
      error: (failure: unknown) => this.fail(failure, 'Associazione calendario non riuscita.')
    });
  }

  calendarCreated(): void {
    this.calendarModalOpen.set(false);
    this.done('Calendario aggiunto.');
  }

  saveCalendar(calendar: CalendarItem): void {
    this.begin();
    const draft = this.calendarDraft(calendar);
    this.http.put(`api/v1/calendars/${calendar.id}`, {
      name: draft.name.trim(), external_id: draft.externalId.trim(), version: calendar.version
    }).subscribe({
      next: () => this.done('Calendario aggiornato.'),
      error: (failure: unknown) => this.fail(failure, 'Aggiornamento calendario non riuscito.')
    });
  }

  calendarDeleted(calendar: CalendarItem): void {
    this.calendarDeleteTarget.set(null);
    this.done(`Calendario “${calendar.name}” eliminato definitivamente.`);
  }

  isAssociated(userId: number, calendarId: number): boolean {
    return this.assignments().some((item) => Number(item.user_id) === userId && Number(item.calendar_id) === calendarId);
  }

  isSelf(user: ManagedUser): boolean {
    return user.id === this.session.user()?.id;
  }

  userDraft(user: ManagedUser): UserDraft {
    return this.userDrafts()[user.id] ?? { role: user.role, status: user.status, email: user.email ?? '' };
  }

  calendarDraft(calendar: CalendarItem): CalendarDraft {
    return this.calendarDrafts()[calendar.id] ?? { name: calendar.name, externalId: calendar.external_id };
  }

  changeUserRole(user: ManagedUser, event: Event): void {
    const role = (event.target as HTMLSelectElement).value as UserRole;
    this.userDrafts.update((current) => ({ ...current, [user.id]: { ...this.userDraft(user), role } }));
  }

  changeUserStatus(user: ManagedUser, event: Event): void {
    const status = (event.target as HTMLSelectElement).value as UserStatus;
    this.userDrafts.update((current) => ({ ...current, [user.id]: { ...this.userDraft(user), status } }));
  }

  changeUserEmail(user: ManagedUser, event: Event): void {
    const email = (event.target as HTMLInputElement).value;
    this.userDrafts.update((current) => ({ ...current, [user.id]: { ...this.userDraft(user), email } }));
  }

  validEmail(email: string): boolean {
    return email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  changeCalendarName(calendar: CalendarItem, event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.calendarDrafts.update((current) => ({
      ...current, [calendar.id]: { ...this.calendarDraft(calendar), name }
    }));
  }

  changeCalendarExternalId(calendar: CalendarItem, event: Event): void {
    const externalId = (event.target as HTMLInputElement).value;
    this.calendarDrafts.update((current) => ({
      ...current, [calendar.id]: { ...this.calendarDraft(calendar), externalId }
    }));
  }

  roleLabel(role: UserRole): string {
    return ({ admin: 'Amministratore', adult: 'Adulto', child: 'Bambino' } as const)[role];
  }

  statusLabel(status: UserStatus): string {
    return status === 'active' ? 'Attivo' : 'Disattivato';
  }

  private begin(): void {
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
  }

  private done(message: string): void {
    this.success.set(message);
    this.load();
  }

  private fail(failure: unknown, fallback: string): void {
    const code = failure instanceof HttpErrorResponse
      ? failure.error?.error?.code
      : null;
    const messages: Record<string, string> = {
      'user.username_exists': 'Lo username è già utilizzato.',
      'user.invalid_username': 'Usa 3-50 lettere, numeri, punti, trattini o underscore.',
      'user.password_short': 'La password deve contenere almeno 12 caratteri.',
      'user.email_invalid': 'Inserisci un indirizzo email valido oppure lascia il campo vuoto.',
      'user.last_admin': 'Non puoi disattivare o declassare l’ultimo amministratore attivo.',
      'user.self_lockout': 'Non puoi declassare o disattivare il tuo account corrente.',
      'version.conflict': 'I dati sono cambiati: la pagina verrà ricaricata prima di riprovare.',
      'calendar.not_found': 'Il calendario non è più disponibile.',
      'authorization.denied': 'Questa funzione è riservata agli amministratori.'
    };
    this.error.set(typeof code === 'string' ? (messages[code] ?? fallback) : fallback);
    this.loading.set(false);
    this.busy.set(false);
  }
}
