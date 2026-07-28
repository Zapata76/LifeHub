import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SessionStore } from '../../core/session.store';
import { GoalsPageComponent } from './goals-page.component';

const overview = {
  members: [
    { id: 1, username: 'Emiliano', role: 'admin' },
    { id: 2, username: 'Giulia', role: 'child' }
  ],
  goals: [{
    id: 2, owner_id: 1, owner_name: 'Emiliano', title: 'Finire la nuova app',
    description: 'Completare tutte le sezioni', start_date: '2026-03-02', end_date: '2026-03-08',
    status: 'active', created_at: '2026-03-02 08:53:07', version: 1, can_edit: true, can_log: true,
    trackers: [{
      id: 2, goal_id: 2, tracker_type: 'percentage', target_value: null, unit_code: 'percent',
      frequency_code: 'daily', version: 1,
      logs: [{ id: 4, tracker_id: 2, log_date: '2026-03-09', value_number: '80.0000',
        value_boolean: null, note: '', version: 1 }]
    }]
  }]
};

describe('GoalsPageComponent', () => {
  async function createFixture() {
    const get = vi.fn(() => of(overview));
    const post = vi.fn((url: string) => of(url === 'api/v1/goals' ? { id: 3 } : { saved: true }));
    const put = vi.fn(() => of({ updated: true }));
    const remove = vi.fn(() => of({ deleted: true }));
    await TestBed.configureTestingModule({
      imports: [GoalsPageComponent],
      providers: [{ provide: HttpClient, useValue: { get, post, put, delete: remove } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set(
      { id: 1, householdId: 1, role: 'admin', username: 'Emiliano' },
      'csrf'
    );
    const fixture = TestBed.createComponent(GoalsPageComponent);
    fixture.detectChanges();
    return { fixture, post, put, remove };
  }

  it('renders planning, owner, tracker and completion information', async () => {
    const { fixture } = await createFixture();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Obiettivi & Abitudini');
    expect(text).toContain('02/03/2026 – 08/03/2026');
    expect(text).toContain('Emiliano');
    expect(text).toContain('Percentuale');
    expect(text).toContain('80% completato');
    expect(fixture.nativeElement.textContent).not.toContain('Mostra archivio');
  });

  it('creates goals with dates, named owner and trackers from a modal', async () => {
    const { fixture, post } = await createFixture();
    (fixture.nativeElement.querySelector('.goal-page-heading .primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.goal-modal [role]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.goal-modal')).not.toBeNull();
    fixture.componentInstance.goalForm.setValue({
      title: 'Nuova abitudine', description: 'Ogni giorno', startDate: '2026-07-20',
      endDate: '2026-08-20', ownerId: '2', status: 'active'
    });
    fixture.componentInstance.addTracker();
    fixture.componentInstance.save();
    expect(post).toHaveBeenCalledWith('api/v1/goals', expect.objectContaining({
      title: 'Nuova abitudine', ownerId: 2, startDate: '2026-07-20',
      trackers: [{ id: null, type: 'boolean', frequency: 'daily' }]
    }));
  });

  it('opens progress history and records the current tracker value', async () => {
    const { fixture, post } = await createFixture();
    (fixture.nativeElement.querySelector('.goal-tracker button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cronologia');
    fixture.componentInstance.logForm.patchValue({ value: 90, date: '2026-07-19' });
    fixture.componentInstance.saveLog();
    expect(post).toHaveBeenCalledWith('api/v1/goal-trackers/2/log', {
      date: '2026-07-19', value: 90, note: ''
    });
  });
});
