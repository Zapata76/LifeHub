import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { CalendarApiService } from './calendar-api.service';
import { CalendarItem } from './calendar.models';
import { CalendarsPageComponent } from './calendars-page.component';

const calendars: CalendarItem[] = [
  { id: 1, name: 'E&S', external_id: 'family@example.test', version: 1 },
  { id: 2, name: 'Giulia', external_id: 'child@example.test', version: 1 }
];

describe('CalendarsPageComponent', () => {
  it('switches to one grouped calendar with a distinct stable color for every source', async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarsPageComponent],
      providers: [{
        provide: CalendarApiService,
        useValue: { list: () => of({ items: calendars }), delete: () => of({ deleted: true }) }
      }]
    }).compileComponents();
    const fixture = TestBed.createComponent(CalendarsPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.calendar-card')).toHaveLength(2);
    fixture.componentInstance.view.set('grouped');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.grouped-calendar .calendar-frame')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.calendar-legend li')).toHaveLength(2);
    const safeUrl = fixture.componentInstance.groupedUrl();
    const url = TestBed.inject(DomSanitizer).sanitize(SecurityContext.RESOURCE_URL, safeUrl) ?? '';
    const parameters = new URL(url).searchParams;
    expect(parameters.getAll('src')).toEqual(['family@example.test', 'child@example.test']);
    expect(new Set(parameters.getAll('color')).size).toBe(2);
  });

  it('opens an explicit confirmation modal instead of exposing archive controls', async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarsPageComponent],
      providers: [{
        provide: CalendarApiService,
        useValue: { list: () => of({ items: calendars }), delete: () => of({ deleted: true }) }
      }]
    }).compileComponents();
    const fixture = TestBed.createComponent(CalendarsPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Mostra archivio');
    expect(fixture.nativeElement.textContent).not.toContain('Archivia');
    const deleteButton = fixture.nativeElement.querySelector('.calendar-card .danger') as HTMLButtonElement;
    deleteButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Elimina definitivamente');
  });
});
