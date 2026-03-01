import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable } from 'rxjs';
import { AuthService, HubUser } from '../../core/auth.service';
import { RuntimeConfigService } from '../../core/runtime-config.service';
import { CalendarsService, HubCalendar } from './calendars.service';

@Component({
  selector: 'app-calendar-page',
  templateUrl: './calendar-page.component.html',
  styleUrls: ['./calendar-page.component.css']
})
export class CalendarPageComponent implements OnInit {
  user$: Observable<HubUser | null>;
  calendarUrl: SafeResourceUrl | null = null;

  constructor(
    private auth: AuthService,
    private runtimeConfig: RuntimeConfigService,
    private calendarsService: CalendarsService,
    private sanitizer: DomSanitizer
  ) {
    this.user$ = this.auth.user$;
  }

  ngOnInit(): void {
    this.loadCalendars();

    if (!this.auth.user) {
      this.auth.me().subscribe(() => this.loadCalendars());
    }
  }

  private loadCalendars() {
    this.calendarsService.getMyCalendars().subscribe(cals => {
      const ids = cals.map(c => c.google_id);
      const url = this.buildCalendarEmbedUrl(ids);
      this.calendarUrl = url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
    });
  }

  private buildCalendarEmbedUrl(calendars: string[]): string | null {
    if (!calendars || calendars.length === 0) return null;
    const options = this.runtimeConfig.calendarOptions;

    const params = [
      `ctz=${encodeURIComponent(options.ctz)}`,
      `mode=${encodeURIComponent(options.mode)}`,
      `wkst=${encodeURIComponent(options.wkst)}`,
      `bgcolor=${encodeURIComponent(options.bgcolor)}`,
      ...calendars.map(id => `src=${encodeURIComponent(id)}`)
    ];

    return `https://calendar.google.com/calendar/embed?${params.join('&')}`;
  }
}
