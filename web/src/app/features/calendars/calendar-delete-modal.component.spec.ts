import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CalendarApiService } from './calendar-api.service';
import { CalendarDeleteModalComponent } from './calendar-delete-modal.component';
import { CalendarItem } from './calendar.models';

describe('CalendarDeleteModalComponent', () => {
  it('physically deletes only after explicit confirmation', async () => {
    const calendar: CalendarItem = { id: 2, name: 'Giulia', external_id: 'child@example.test', version: 4 };
    const remove = vi.fn(() => of({ deleted: true }));
    await TestBed.configureTestingModule({
      imports: [CalendarDeleteModalComponent],
      providers: [{ provide: CalendarApiService, useValue: { delete: remove } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(CalendarDeleteModalComponent);
    fixture.componentRef.setInput('calendar', calendar);
    const deleted = vi.fn();
    fixture.componentInstance.deleted.subscribe(deleted);

    fixture.componentInstance.confirm();

    expect(remove).toHaveBeenCalledWith(calendar);
    expect(deleted).toHaveBeenCalledOnce();
  });
});
