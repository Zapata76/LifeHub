import { Component, OnInit } from '@angular/core';
import { HubManagedUser, UsersService } from './users.service';

@Component({
  selector: 'app-users-page',
  template: `
    <div class="wrap">
      <header>
        <div class="header-content">
          <div class="header-row header-top">
            <h1 class="page-title">
              <span class="title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="9" cy="8" r="3"/>
                  <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5"/>
                  <path d="M18 8h3"/>
                  <path d="M19.5 6.5v3"/>
                </svg>
              </span>
              <span>Gestione Utenti</span>
            </h1>
          </div>
          <div class="header-row header-bottom">
            <div class="header-controls">
              <a href="#/home" class="home-link">Home Hub</a>
            </div>
          </div>
        </div>
      </header>

      <section class="card">
        <h2>Nuovo Utente</h2>
        <p class="status" [class.err]="statusMode==='err'" [class.ok]="statusMode==='ok'">{{ status }}</p>
        <form class="row" (submit)="create($event)" autocomplete="off">
          <input [(ngModel)]="newUsername" name="newUsername" placeholder="Username" autocomplete="new-username" required>
          <input [(ngModel)]="newPassword" name="newPassword" placeholder="Password" type="password" autocomplete="new-password" required>
          <select [(ngModel)]="newRole" name="newRole">
            <option *ngFor="let r of roles" [value]="r">{{ r }}</option>
          </select>
          <button type="submit">Crea</button>
        </form>
      </section>

      <section class="card">
        <h2>Utenti</h2>
        <table>
          <thead>
          <tr><th>Username</th><th>Ruolo</th><th>Azioni</th></tr>
          </thead>
          <tbody>
          <tr *ngFor="let u of users">
            <td>{{ u.username }}</td>
            <td>
              <select [(ngModel)]="u.role" [ngModelOptions]="{standalone:true}">
                <option *ngFor="let r of roles" [value]="r">{{ r }}</option>
              </select>
            </td>
            <td class="actions">
              <button (click)="saveRole(u)">Salva ruolo</button>
              <button (click)="resetPassword(u)">Reset password</button>
              <button class="danger" (click)="remove(u)">Elimina</button>
            </td>
          </tr>
          </tbody>
        </table>
      </section>
    </div>
  `,
  styles: [`
    .wrap { min-height:100vh; background:#121212; color:#e4e4e4; font-family:system-ui,sans-serif; }
    header { background:#1e1e1e; border-bottom:1px solid #2a2a2a; padding:15px 20px; margin-bottom:14px; }
    .header-content { max-width:1100px; margin:0 auto; display:flex; flex-direction:column; gap:10px; }
    .header-row { display:flex; justify-content:space-between; align-items:center; }
    .header-controls { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .page-title { margin:0; color:#4f8cff; font-size:1.4rem; display:flex; align-items:center; gap:10px; }
    .title-icon { width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; flex:0 0 22px; }
    .title-icon svg { width:100%; height:100%; fill:none; stroke:#4f8cff; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    .home-link { color:#9aa0a6; text-decoration:none; border:1px solid #333; padding:4px 10px; border-radius:6px; background:#2a2a2a; font-size:0.85rem; }
    .card { max-width:1100px; margin:0 auto 14px; background:#1e1e1e; border:1px solid #2a2a2a; border-radius:12px; padding:14px; }
    .row { display:grid; grid-template-columns:1.2fr 1fr .8fr auto; gap:8px; }
    input,select,button { padding:10px; border-radius:8px; border:1px solid #333; background:#121212; color:#fff; }
    button { background:#4f8cff; border-color:transparent; cursor:pointer; font-weight:700; }
    .danger { background:#8c2d2d; }
    table { width:100%; border-collapse:collapse; }
    th,td { padding:10px 8px; border-bottom:1px solid #2a2a2a; text-align:left; vertical-align:middle; }
    .actions { display:flex; gap:8px; flex-wrap:wrap; }
    .status { min-height:18px; color:#9aa0a6; }
    .status.err { color:#ff7a7a; } .status.ok { color:#30c48d; }
    @media (max-width:900px){ .row{grid-template-columns:1fr;} .actions{flex-direction:column;} }
  `]
})
export class UsersPageComponent implements OnInit {
  users: HubManagedUser[] = [];
  roles: string[] = ['admin', 'adult', 'child'];
  newUsername = '';
  newPassword = '';
  newRole = 'adult';
  status = '';
  statusMode: '' | 'ok' | 'err' = '';

  constructor(private usersService: UsersService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.usersService.getRoles().subscribe(
      roles => {
        this.roles = roles || this.roles;
        if (this.roles.indexOf(this.newRole) === -1) this.newRole = this.roles[0] || 'adult';
      },
      () => {}
    );
    this.usersService.getUsers().subscribe(
      users => this.users = users || [],
      err => this.setStatus(this.extractError(err), 'err')
    );
  }

  create(evt: Event) {
    evt.preventDefault();
    this.usersService.createUser({
      username: this.newUsername.trim(),
      password: this.newPassword,
      role: this.newRole
    }).subscribe(
      () => {
        this.newUsername = '';
        this.newPassword = '';
        this.setStatus('Utente creato', 'ok');
        this.load();
      },
      err => this.setStatus(this.extractError(err), 'err')
    );
  }

  saveRole(u: HubManagedUser) {
    this.usersService.updateRole({ id: u.id, role: u.role }).subscribe(
      () => this.setStatus('Ruolo aggiornato', 'ok'),
      err => this.setStatus(this.extractError(err), 'err')
    );
  }

  resetPassword(u: HubManagedUser) {
    const pass = prompt('Nuova password per ' + u.username + ':');
    if (pass === null) return;
    this.usersService.updatePassword({ id: u.id, password: pass }).subscribe(
      () => this.setStatus('Password aggiornata', 'ok'),
      err => this.setStatus(this.extractError(err), 'err')
    );
  }

  remove(u: HubManagedUser) {
    if (!confirm('Eliminare ' + u.username + '?')) return;
    this.usersService.deleteUser(u.id).subscribe(
      () => {
        this.setStatus('Utente eliminato', 'ok');
        this.load();
      },
      err => this.setStatus(this.extractError(err), 'err')
    );
  }

  private extractError(err: any): string {
    return err && err.error && err.error.error ? err.error.error : 'Operazione fallita';
  }

  private setStatus(message: string, mode: '' | 'ok' | 'err') {
    this.status = message;
    this.statusMode = mode;
  }
}
