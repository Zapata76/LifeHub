import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, finalize, fromEvent, merge, timeout, timer } from 'rxjs';

interface TodayWeather {
  date: string;
  location: string | null;
  forecast: { date: string; condition: string; min: number | null; max: number | null; rain: number | null } | null;
}

@Component({
  selector: 'lh-today-weather',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading() || weather()?.location || unavailable()) {
      <section class="card home-weather" aria-labelledby="today-weather-title" [attr.aria-busy]="loading()">
        <div class="home-weather-heading">
          <div><h2 id="today-weather-title">Meteo di oggi</h2>
            @if (weather(); as report) {
              <p class="muted">{{ report.location }} · {{ dateLabel(report.date) }}</p>
            }
          </div>
          @if (weather()?.forecast; as forecast) {
            <p class="home-weather-condition">{{ forecast.condition }}</p>
          }
        </div>
        @if (weather()?.forecast; as forecast) {
          <dl class="home-weather-values">
            <div><dt>Minima</dt><dd>{{ value(forecast.min, ' °C') }}</dd></div>
            <div><dt>Massima</dt><dd>{{ value(forecast.max, ' °C') }}</dd></div>
            <div><dt>Probabilità di pioggia</dt><dd>{{ value(forecast.rain, '%') }}</dd></div>
          </dl>
        } @else if (loading()) {
          <p class="muted" role="status">Caricamento previsioni…</p>
        } @else {
          <p class="muted" role="status">Previsioni meteo temporaneamente non disponibili.</p>
        }
      </section>
    }
  `
})
export class TodayWeatherComponent {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' });
  private readonly numberFormatter = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
  private nextRefresh = 0;
  private requestedDay = '';
  private request?: Subscription;
  readonly loading = signal(false);
  readonly unavailable = signal(false);
  readonly weather = signal<TodayWeather | null>(null);

  constructor() {
    this.refresh();
    merge(fromEvent(window, 'focus'), fromEvent(document, 'visibilitychange'), timer(60_000, 60_000))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { if (!document.hidden) this.refresh(); });
  }

  value(value: number | null, unit: string): string {
    return value === null ? 'n/d' : this.numberFormatter.format(value) + unit;
  }

  dateLabel(date: string): string {
    return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' }).format(new Date(date + 'T12:00:00'));
  }

  private refresh(): void {
    const day = this.dayFormatter.format(new Date());
    if (day !== this.requestedDay) {
      // A suspended tab may resume with yesterday's request still pending.
      this.request?.unsubscribe();
      this.weather.set(null);
    } else if (this.loading() || Date.now() < this.nextRefresh) {
      return;
    }
    this.requestedDay = day;
    this.loading.set(true);
    this.request = this.http.get<TodayWeather>('api/v1/weather/today').pipe(
      timeout(15_000),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (weather) => {
        const today = this.dayFormatter.format(new Date());
        if (day !== today || weather.date !== today || (weather.forecast && weather.forecast.date !== today)) {
          this.markUnavailable();
          return;
        }
        this.weather.set(weather);
        this.unavailable.set(weather.location !== null && weather.forecast === null);
        this.nextRefresh = Date.now() + (this.unavailable() ? 60_000 : 30 * 60_000);
      },
      error: () => this.markUnavailable()
    });
  }

  private markUnavailable(): void {
    this.weather.set(null);
    this.unavailable.set(true);
    this.nextRefresh = Date.now() + 60_000;
  }
}
