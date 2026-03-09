import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HubManagedUser, UsersService } from './users.service';
import { CalendarsService, HubCalendar } from '../calendar/calendars.service';

@Component({
    selector: 'app-users-page',
    templateUrl: './users-page.component.html',
    styleUrls: ['./users-page.component.css'],
    standalone: false
})
export class UsersPageComponent implements OnInit {
  users: HubManagedUser[] = [];
  roles: string[] = ['admin', 'adult', 'child'];
  status = '';
  statusMode: '' | 'ok' | 'err' = '';

  userForm: FormGroup;
  calendarForm: FormGroup;

  allCalendars: HubCalendar[] = [];
  userAssociations: { [userId: number]: number[] } = {};

  constructor(
    private usersService: UsersService,
    private calendarsService: CalendarsService,
    private fb: FormBuilder
  ) {
    this.userForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
      role: ['adult', Validators.required]
    });

    this.calendarForm = this.fb.group({
      name: ['', Validators.required],
      googleId: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.load();
    this.loadCalendars();
  }

  load() {
    this.usersService.getRoles().subscribe(
      roles => {
        this.roles = roles || this.roles;
        const currentRole = this.userForm.get('role')?.value;
        if (this.roles.indexOf(currentRole) === -1) {
          this.userForm.patchValue({ role: this.roles[0] || 'adult' });
        }
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
    if (this.calendarForm.invalid) return;
    const { name, googleId } = this.calendarForm.value;
    this.calendarsService.saveCalendar({ name, google_id: googleId }).subscribe(() => {
      this.calendarForm.reset({ name: '', googleId: '' });
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

  create() {
    if (this.userForm.invalid) return;
    const { username, password, role } = this.userForm.value;
    this.usersService.createUser({
      username: username.trim(),
      password: password,
      role: role
    }).subscribe(
      () => {
        const currentRole = this.userForm.get('role')?.value;
        this.userForm.reset({ username: '', password: '', role: currentRole });
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
