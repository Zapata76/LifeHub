import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CalendarApiService } from './calendar-api.service';
import { CalendarFormModalComponent } from './calendar-form-modal.component';
import { CalendarItem } from './calendar.models';

const createdCalendar: CalendarItem = {
  id: 3, name: 'Famiglia', external_id: 'family@example.test', version: 1
};

describe('CalendarFormModalComponent', () => {
  it('creates a trimmed calendar and notifies the host so both pages can close the shared modal', async () => {
    const create = vi.fn(() => of({ item: createdCalendar }));
    await TestBed.configureTestingModule({
      imports: [CalendarFormModalComponent],
      providers: [{ provide: CalendarApiService, useValue: { create } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(CalendarFormModalComponent);
    const emitted = vi.fn();
    fixture.componentInstance.created.subscribe(emitted);
    fixture.componentInstance.form.setValue({ name: '  Famiglia  ', externalId: '  family@example.test  ' });

    fixture.componentInstance.save();

    expect(create).toHaveBeenCalledWith({ name: 'Famiglia', external_id: 'family@example.test' });
    expect(emitted).toHaveBeenCalledWith(createdCalendar);
    expect(fixture.componentInstance.busy()).toBe(false);
  });
});
