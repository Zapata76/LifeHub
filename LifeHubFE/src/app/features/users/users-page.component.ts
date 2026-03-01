import { Component, OnInit } from '@angular/core';
import { HubManagedUser, UsersService } from './users.service';
import { CalendarsService, HubCalendar } from '../calendar/calendars.service';

@Component({
  selector: 'app-users-page',
  templateUrl: './users-page.component.html',
  styleUrls: ['./users-page.component.css']
})
export class UsersPageComponent implements OnInit {
  users: HubManagedUser[] = [];
  roles: string[] = ['admin', 'adult', 'child'];
  newUsername = '';
  newPassword = '';
  newRole = 'adult';
  status = '';
  statusMode: '' | 'ok' | 'err' = '';

  allCalendars: HubCalendar[] = [];
  userAssociations: { [userId: number]: number[] } = {};
  newCalName = '';
  newCalGoogleId = '';

  constructor(
    private usersService: UsersService,
    private calendarsService: CalendarsService
  ) {}

  ngOnInit() {
    this.load();
    this.loadCalendars();
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
      users => {
        this.users = users || [];
        this.users.forEach(u => this.loadUserAssociations(u.id));
      },
      err => this.setStatus(this.extractError(err), 'err')
    );
  }

  loadCalendars() {
    this.calendarsService.getAllCalendars().subscribe(cals => {
      this.allCalendars = (cals || []).map(c => ({ ...c, id: Number(c.id) }));
    });
  }

  loadUserAssociations(userId: number) {
    this.calendarsService.getUserAssociations(userId).subscribe(ids => {
      // Force change detection by creating new object reference
      this.userAssociations = {
        ...this.userAssociations,
        [userId]: (ids || []).map(id => Number(id))
      };
    });
  }

  isCalendarAssociated(userId: number, calendarId: number): boolean {
    const associatedIds = this.userAssociations[userId] || [];
    return associatedIds.indexOf(Number(calendarId)) !== -1;
  }

  toggleAssociation(userId: number, calendarId: number, event: any) {
    const current = this.userAssociations[userId] || [];
    let next: number[];
    if (event.target.checked) {
      next = [...current, Number(calendarId)];
    } else {
      next = current.filter(id => id !== Number(calendarId));
    }
    
    this.calendarsService.updateUserAssociations(userId, next).subscribe(() => {
      this.userAssociations = {
        ...this.userAssociations,
        [userId]: next
      };
    });
  }

  addCalendar() {
    this.calendarsService.saveCalendar({ name: this.newCalName, google_id: this.newCalGoogleId }).subscribe(() => {
      this.newCalName = '';
      this.newCalGoogleId = '';
      this.loadCalendars();
    });
  }

  updateCalendar(c: HubCalendar) {
    this.calendarsService.saveCalendar(c).subscribe();
  }

  deleteCalendar(id: number) {
    if (!confirm('Eliminare questo calendario?')) return;
    this.calendarsService.deleteCalendar(id).subscribe(() => this.loadCalendars());
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
