import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SessionStore } from '../core/session.store';
import { UserManagementComponent } from './user-management.component';

const users = [
  { id: 1, username: 'Emiliano', email: 'emiliano@example.test', role: 'admin', status: 'active', version: 1 },
  { id: 2, username: 'Giulia', email: null, role: 'child', status: 'active', version: 1 },
  { id: 3, username: 'Simona', email: null, role: 'adult', status: 'active', version: 1 }
];
const calendars = [
  { id: 1, name: 'Giulia', external_id: 'child@example.test', version: 1 },
  { id: 2, name: 'E&S', external_id: 'family@example.test', version: 1 }
];

function responseFor(url: string) {
  if (url === 'api/v1/admin/weather-settings') return of({ location: null, version: 1 });
  if (url === 'api/v1/users') return of({ items: users, calendarAssignments: [] });
  if (url === 'api/v1/calendars') return of({ items: calendars });
  if (url === 'api/v1/admin/home-settings') return of({
    homeEyebrow: 'Oggi in famiglia', homeTitle: 'Simona puzzona', version: 2
  });
  throw new Error(`Unexpected URL: ${url}`);
}

describe('UserManagementComponent', () => {
  async function createFixture() {
    const put = vi.fn(() => of({ updated: true }));
    await TestBed.configureTestingModule({
      imports: [UserManagementComponent],
      providers: [{ provide: HttpClient, useValue: { get: responseFor, put } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'Emiliano' }, 'csrf');
    const fixture = TestBed.createComponent(UserManagementComponent);
    fixture.detectChanges();
    return { fixture, put };
  }

  it('selects the actual role of every user instead of falling back to Administrator', async () => {
    const { fixture } = await createFixture();
    const selects = Array.from(fixture.nativeElement.querySelectorAll('.management-fields select')) as HTMLSelectElement[];

    expect([selects[0].value, selects[2].value, selects[4].value]).toEqual(['admin', 'child', 'adult']);
    expect([
      selects[0].selectedOptions[0].textContent?.trim(),
      selects[2].selectedOptions[0].textContent?.trim(),
      selects[4].selectedOptions[0].textContent?.trim()
    ]).toEqual(['Amministratore', 'Bambino', 'Adulto']);
  });

  it('opens user creation and shared calendar creation only in modals, without calendar archive controls', async () => {
    const { fixture } = await createFixture();
    expect(fixture.nativeElement.querySelector('.user-modal-backdrop')).toBeNull();
    const usersArea = fixture.nativeElement.querySelector('.users-admin');
    expect(usersArea?.querySelector('.eyebrow')?.textContent).toContain('Utenti');
    expect(usersArea?.querySelectorAll('.management-row').length).toBe(3);

    (usersArea.querySelector('.new-user-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.user-modal-backdrop [role="dialog"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Crea utente');

    fixture.componentInstance.closeUserModal();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.calendar-admin .primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('lh-calendar-form-modal [role="dialog"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Mostra archivio');
    expect(fixture.nativeElement.textContent).not.toContain('Archivia');
  });

  it('edits and persists both home labels from Admin', async () => {
    const { fixture, put } = await createFixture();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Admin');
    fixture.componentInstance.homeForm.setValue({
      homeEyebrow: 'Messaggio del giorno', homeTitle: 'Benvenuti a casa'
    });
    fixture.componentInstance.homeForm.markAsDirty();
    fixture.componentInstance.saveHomeSettings();
    expect(fixture.componentInstance.homeForm.pristine).toBe(true);

    expect(put).toHaveBeenCalledWith('api/v1/admin/home-settings', {
      homeEyebrow: 'Messaggio del giorno', homeTitle: 'Benvenuti a casa', version: 2
    });
  });

  it('allows the current administrator to save an optional notification email', async () => {
    const { fixture, put } = await createFixture();
    const user = fixture.componentInstance.users()[0];
    fixture.componentInstance.changeUserEmail(user, { target: { value: 'new@example.test' } } as unknown as Event);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.management-row').getAttribute('data-unsaved-changes')).toBe('true');
    fixture.componentInstance.saveUser(user);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.management-row').hasAttribute('data-unsaved-changes')).toBe(false);

    expect(put).toHaveBeenCalledWith('api/v1/users/1', {
      role: 'admin', status: 'active', email: 'new@example.test', version: 1
    });
  });

  it('protects edited calendar drafts and releases them after saving', async () => {
    const { fixture } = await createFixture();
    const calendar = fixture.componentInstance.calendars()[0];
    fixture.componentInstance.changeCalendarName(calendar, { target: { value: 'Nuovo nome' } } as unknown as Event);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.calendar-editor').getAttribute('data-unsaved-changes')).toBe('true');
    fixture.componentInstance.saveCalendar(calendar);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.calendar-editor').hasAttribute('data-unsaved-changes')).toBe(false);
  });
});
