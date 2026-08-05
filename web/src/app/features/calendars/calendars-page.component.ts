import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CalendarApiService } from './calendar-api.service';
import { CalendarDeleteModalComponent } from './calendar-delete-modal.component';
import { CalendarFormModalComponent } from './calendar-form-modal.component';
import { CalendarItem } from './calendar.models';

type CalendarView = 'separate' | 'grouped';

interface CalendarDisplay {
  calendar: CalendarItem;
  color: string;
  colorClass: string;
  url: SafeResourceUrl;
}

const CALENDAR_COLORS = [
  '#7986CB', '#33B679', '#E67C73', '#F6BF26', '#8E24AA',
  '#039BE5', '#616161', '#D50000', '#0B8043', '#3F51B5'
] as const;

@Component({
  standalone: true,
  imports: [CalendarFormModalComponent, CalendarDeleteModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading calendar-page-heading">
      <div><p class="eyebrow">Modulo</p><h1>Calendari</h1></div>
      <div class="actions">
        <button class="primary" type="button" (click)="calendarModalOpen.set(true)">+ Nuovo calendario</button>
      </div>
    </div>

    <div class="calendar-view-switch" role="group" aria-label="Modalità di visualizzazione dei calendari">
      <button type="button" [class.active]="view() === 'separate'" (click)="view.set('separate')">Separati</button>
      <button type="button" [class.active]="view() === 'grouped'" (click)="view.set('grouped')">Raggruppati</button>
    </div>

    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    @if (success()) { <p class="success" role="status">{{ success() }}</p> }
    @if (loading()) { <p class="state" role="status">Caricamento…</p> }
    @else if (displays().length === 0) {
      <p class="state">Non ci sono calendari.</p>
    } @else if (view() === 'grouped') {
      <section class="card grouped-calendar" aria-labelledby="grouped-calendar-title">
        <div class="grouped-calendar-header">
          <div><p class="eyebrow">Vista unificata</p><h2 id="grouped-calendar-title">Tutti i calendari</h2></div>
          <ul class="calendar-legend" aria-label="Colori dei calendari">
            @for (display of displays(); track display.calendar.id) {
              <li><span class="{{ display.colorClass }}"></span>{{ display.calendar.name }}</li>
            }
          </ul>
        </div>
        <iframe class="calendar-frame grouped" [src]="groupedUrl()" title="Calendari raggruppati"></iframe>
      </section>
    } @else {
      <section class="calendar-cards" aria-label="Calendari separati">
        @for (display of displays(); track display.calendar.id) {
          <article class="card calendar-card {{ display.colorClass }}">
            <header>
              <div><span class="calendar-color {{ display.colorClass }}"></span><h2>{{ display.calendar.name }}</h2></div>
              <button class="danger" type="button" [disabled]="busy()" (click)="deleteTarget.set(display.calendar)">
                Elimina
              </button>
            </header>
            <iframe class="calendar-frame" [src]="display.url" [title]="'Calendario ' + display.calendar.name"></iframe>
          </article>
        }
      </section>
    }

    @if (calendarModalOpen()) {
      <lh-calendar-form-modal (dismissed)="calendarModalOpen.set(false)" (created)="calendarCreated()" />
    }
    @if (deleteTarget(); as calendar) {
      <lh-calendar-delete-modal [calendar]="calendar" (dismissed)="deleteTarget.set(null)"
        (deleted)="calendarDeleted(calendar)" />
    }
  `
})
export class CalendarsPageComponent {
  private readonly api = inject(CalendarApiService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly calendars = signal<CalendarItem[]>([]);
  readonly displays = signal<CalendarDisplay[]>([]);
  readonly groupedUrl = signal<SafeResourceUrl>(this.sanitizer.bypassSecurityTrustResourceUrl('about:blank'));
  readonly view = signal<CalendarView>('separate');
  readonly calendarModalOpen = signal(false);
  readonly deleteTarget = signal<CalendarItem | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list().subscribe({
      next: ({ items }) => {
        const calendars = items.map((calendar) => ({
          ...calendar, id: Number(calendar.id), version: Number(calendar.version)
        })).sort((left, right) => left.id - right.id);
        this.calendars.set(calendars);
        this.prepareDisplays(calendars);
        this.loading.set(false);
        this.busy.set(false);
      },
      error: () => {
        this.error.set('Impossibile caricare i calendari.');
        this.loading.set(false);
        this.busy.set(false);
      }
    });
  }

  calendarCreated(): void {
    this.calendarModalOpen.set(false);
    this.success.set('Calendario aggiunto.');
    this.load();
  }

  calendarDeleted(calendar: CalendarItem): void {
    this.deleteTarget.set(null);
    this.success.set(`Calendario “${calendar.name}” eliminato definitivamente.`);
    this.load();
  }

  private prepareDisplays(calendars: CalendarItem[]): void {
    const displays = calendars.map((calendar, index) => {
      const colorIndex = index % CALENDAR_COLORS.length;
      const color = CALENDAR_COLORS[colorIndex];
      return { calendar, color, colorClass: `calendar-theme-${colorIndex}`, url: this.safeUrl([calendar], [color]) };
    });
    this.displays.set(displays);
    this.groupedUrl.set(this.safeUrl(calendars, displays.map((display) => display.color)));
  }

  private safeUrl(calendars: CalendarItem[], colors: string[]): SafeResourceUrl {
    const parameters = new URLSearchParams({
      ctz: 'Europe/Rome', mode: 'MONTH', showTitle: '0', showCalendars: '0', showPrint: '0'
    });
    calendars.forEach((calendar, index) => {
      parameters.append('src', calendar.external_id);
      parameters.append('color', colors[index]);
    });
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://calendar.google.com/calendar/embed?${parameters.toString()}`
    );
  }
}
