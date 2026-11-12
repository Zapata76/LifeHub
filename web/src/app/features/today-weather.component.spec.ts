import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayWeatherComponent } from './today-weather.component';

describe('TodayWeatherComponent', () => {
  const report = {
    date: '2026-11-08', location: 'Catania',
    forecast: { date: '2026-11-08', condition: 'Sereno', min: null, max: 0, rain: 0 }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T10:00:00Z'));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    TestBed.configureTestingModule({
      imports: [TodayWeatherComponent], providers: [provideHttpClient(), provideHttpClientTesting()]
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function setup() {
    const fixture = TestBed.createComponent(TodayWeatherComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }

  it('renders daily conditions and distinguishes zero from missing values', () => {
    const { fixture, http } = setup();
    expect(fixture.nativeElement.textContent).toContain('Caricamento previsioni');
    http.expectOne('api/v1/weather/today').flush(report);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    for (const value of ['Meteo di oggi', 'Catania', '8 novembre', 'Sereno', 'n/d', '0 °C', '0%']) {
      expect(text).toContain(value);
    }
    window.dispatchEvent(new Event('focus'));
    http.expectNone('api/v1/weather/today');
    vi.advanceTimersByTime(30 * 60_000);
    http.expectOne('api/v1/weather/today').flush(report);
    fixture.destroy();
    vi.advanceTimersByTime(30 * 60_000);
    http.expectNone('api/v1/weather/today');
  });

  it('hides the card when no location is configured', () => {
    const { fixture, http } = setup();
    http.expectOne('api/v1/weather/today').flush({ date: report.date, location: null, forecast: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('handles provider and network failures without keeping misleading forecast values', () => {
    const { fixture, http } = setup();
    http.expectOne('api/v1/weather/today').flush({ ...report, forecast: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Catania');
    expect(fixture.nativeElement.textContent).toContain('temporaneamente non disponibili');
    vi.advanceTimersByTime(60_000);
    http.expectOne('api/v1/weather/today').flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('temporaneamente non disponibili');
    vi.advanceTimersByTime(60_000);
    http.expectOne('api/v1/weather/today').flush(report);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sereno');
    expect(fixture.nativeElement.textContent).not.toContain('temporaneamente non disponibili');
  });

  it('refreshes after Italian midnight on returning to the app, even before 30 minutes', () => {
    vi.setSystemTime(new Date('2026-11-08T22:55:00Z'));
    const { fixture, http } = setup();
    http.expectOne('api/v1/weather/today').flush(report);
    vi.setSystemTime(new Date('2026-11-08T23:01:00Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Sereno');
    http.expectOne('api/v1/weather/today').flush({
      ...report, date: '2026-11-09', forecast: { ...report.forecast, date: '2026-11-09', condition: 'Coperto' }
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('9 novembre');
    expect(fixture.nativeElement.textContent).toContain('Coperto');
  });

  it('times out a stalled request and recovers on a later refresh', () => {
    const { fixture, http } = setup();
    const pending = http.expectOne('api/v1/weather/today');
    vi.advanceTimersByTime(15_000);
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('temporaneamente non disponibili');
    window.dispatchEvent(new Event('focus'));
    http.expectNone('api/v1/weather/today');
    vi.advanceTimersByTime(105_000);
    http.expectOne('api/v1/weather/today').flush(report);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sereno');
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('cancels a pending refresh and clears yesterday on resuming after midnight', () => {
    vi.setSystemTime(new Date('2026-11-08T22:25:00Z'));
    const { fixture, http } = setup();
    http.expectOne('api/v1/weather/today').flush(report);
    vi.advanceTimersByTime(30 * 60_000);
    const pending = http.expectOne('api/v1/weather/today');
    // Simulate suspension: wall time moves forward before the timeout callback runs.
    vi.setSystemTime(new Date('2026-11-08T23:05:00Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('Sereno');
    expect(fixture.componentInstance.loading()).toBe(true);
    http.expectOne('api/v1/weather/today').flush({
      ...report, date: '2026-11-09', forecast: { ...report.forecast, date: '2026-11-09', condition: 'Coperto' }
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('9 novembre');
    expect(fixture.nativeElement.textContent).toContain('Coperto');
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('discards a response crossing midnight before a focus or timer event', () => {
    vi.setSystemTime(new Date('2026-11-08T22:59:59Z'));
    const { fixture, http } = setup();
    const pending = http.expectOne('api/v1/weather/today');
    vi.setSystemTime(new Date('2026-11-08T23:00:01Z'));
    pending.flush(report);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Sereno');
    expect(fixture.componentInstance.loading()).toBe(false);
    window.dispatchEvent(new Event('focus'));
    http.expectOne('api/v1/weather/today').flush({ date: '2026-11-09', location: null, forecast: null });
  });

  it.each(['report', 'forecast'])('rejects an outdated %s date in the server response', (part) => {
    const { fixture, http } = setup();
    http.expectOne('api/v1/weather/today').flush({
      ...report, date: part === 'report' ? '2026-11-07' : report.date,
      forecast: { ...report.forecast, date: part === 'forecast' ? '2026-11-07' : report.date }
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.weather()).toBeNull();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('temporaneamente non disponibili');
  });
});
