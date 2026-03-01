import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface CalendarOptions {
  ctz: string;
  mode: string;
  wkst: string;
  bgcolor: string;
}

export interface RuntimeConfigFile {
  appTitle?: string;
  calendarOptions?: Partial<CalendarOptions>;
}

const DEFAULT_APP_TITLE = 'Life Hub';

const DEFAULT_CALENDAR_OPTIONS: CalendarOptions = {
  ctz: 'Europe/Rome',
  mode: 'MONTH',
  wkst: '2',
  bgcolor: '#ffffff'
};

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private appTitleValue = DEFAULT_APP_TITLE;
  private calendarOptionsValue: CalendarOptions = { ...DEFAULT_CALENDAR_OPTIONS };

  constructor(private http: HttpClient) {}

  load(): Promise<void> {
    return this.http
      .get<RuntimeConfigFile>('assets/runtime-config.json', { withCredentials: false })
      .pipe(catchError(() => of({} as RuntimeConfigFile)))
      .toPromise()
      .then((cfg: RuntimeConfigFile | undefined) => {
        const config = cfg || {};
        this.appTitleValue = (config.appTitle || '').trim() || DEFAULT_APP_TITLE;
        this.calendarOptionsValue = {
          ...DEFAULT_CALENDAR_OPTIONS,
          ...(config.calendarOptions || {})
        };
      });
  }

  get appTitle(): string {
    return this.appTitleValue;
  }

  get calendarOptions(): CalendarOptions {
    return this.calendarOptionsValue;
  }
}
