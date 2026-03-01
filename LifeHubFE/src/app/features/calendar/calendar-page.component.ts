import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable } from 'rxjs';
import { AuthService, HubUser } from '../../core/auth.service';
import { RuntimeConfigService } from '../../core/runtime-config.service';
import { CalendarsService, HubCalendar } from './calendars.service';

@Component({
  selector: 'app-calendar-page',
  template: `
    <div class="page">
      <header>
        <div class="header-content">
          <div class="header-row header-top">
            <h1 class="page-title">
              <span class="title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="17" rx="2"/>
                  <path d="M8 2v4"/>
                  <path d="M16 2v4"/>
                  <path d="M3 10h18"/>
                </svg>
              </span>
              <span>Calendario</span>
            </h1>
          </div>
          <div class="header-row header-bottom">
            <div class="header-controls">
              <span class="user-badge" *ngIf="(user$ | async) as user">{{ user.username }}</span>
              <a routerLink="/home" class="home-link">Home Hub</a>
            </div>
          </div>
        </div>
      </header>

      <div class="calendar-container" *ngIf="calendarUrl; else noCalendar">
        <iframe [src]="calendarUrl" title="Calendario condiviso"></iframe>
      </div>

      <ng-template #noCalendar>
        <div class="calendar-empty">
          Nessun calendario associato al tuo account. Chiedi all'amministratore di configurare i tuoi calendari nella sezione Gestione Utenti.
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .page {
      height: 100vh;
      background: #121212;
      color: #e4e4e4;
      font-family: system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    header {
      background: #1e1e1e;
      border-bottom: 1px solid #2a2a2a;
      padding: 15px 20px;
    }
    .header-content {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-controls {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .page-title { margin: 0; color: #4f8cff; font-size: 1.4rem; display: flex; align-items: center; gap: 10px; }
    .title-icon { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 22px; }
    .title-icon svg { width: 100%; height: 100%; fill: none; stroke: #4f8cff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .user-badge {
      font-size: 0.8rem;
      color: #4f8cff;
      border: 1px solid #4f8cff44;
      padding: 4px 10px;
      border-radius: 6px;
    }
    .home-link {
      color: #9aa0a6;
      text-decoration: none;
      font-size: 0.85rem;
      border: 1px solid #333;
      padding: 4px 10px;
      border-radius: 6px;
      background: #2a2a2a;
    }
    .calendar-container {
      flex: 1 1 auto;
      min-height: 0;
      padding: 15px;
      display: flex;
    }
    iframe {
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      height: 100%;
      border: none;
      border-radius: 8px;
      background: #fff;
    }
    .calendar-empty {
      margin: 15px;
      padding: 18px;
      border-radius: 8px;
      border: 1px solid #2a2a2a;
      background: #1e1e1e;
      color: #9aa0a6;
      font-size: 0.95rem;
    }
  `]
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
