import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { WeatherSettingsComponent } from './weather-settings.component';

describe('WeatherSettingsComponent', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function setup() {
    TestBed.configureTestingModule({
      imports: [WeatherSettingsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    const fixture = TestBed.createComponent(WeatherSettingsComponent);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('api/v1/admin/weather-settings').flush({ location: null, version: 1 });
    fixture.detectChanges();
    return { fixture, http, component: fixture.componentInstance };
  }

  it('searches a location, saves it explicitly and can disable weather', () => {
    const { component, fixture, http } = setup();
    expect(fixture.nativeElement.querySelector('form[role="search"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Meteo di oggi');
    expect(fixture.nativeElement.textContent).toContain('Meteo non attivo');
    component.searchForm.setValue({ query: 'Catania' });
    component.search();
    const location = { name: 'Catania, Sicilia, Italia', latitude: 37.5, longitude: 15.09 };
    http.expectOne('api/v1/admin/weather-locations?q=Catania').flush({ items: [location] });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.weather-results button') as HTMLButtonElement).click();
    expect(component.form.getRawValue()).toEqual(location);
    expect(component.form.dirty).toBe(true);
    http.expectNone((request) => request.method === 'PUT');
    component.save();
    const save = http.expectOne('api/v1/admin/weather-settings');
    expect(save.request.body).toEqual({ location, version: 1 });
    save.flush({ location, version: 2 });
    expect(component.form.pristine).toBe(true);
    component.remove();
    const remove = http.expectOne('api/v1/admin/weather-settings');
    expect(remove.request.body).toEqual({ location: null, version: 2 });
    remove.flush({ location: null, version: 3 });
    expect(component.savedName()).toBe('');
  });

  it('rejects invalid coordinates and reports concurrent edits without claiming success', () => {
    const { component, http } = setup();
    component.form.setValue({ name: 'Casa', latitude: 91, longitude: 0 });
    component.save();
    http.expectNone((request) => request.method === 'PUT');
    component.form.controls.latitude.setValue(0);
    component.save();
    http.expectOne('api/v1/admin/weather-settings').flush({}, { status: 409, statusText: 'Conflict' });
    expect(component.error()).toContain('Ricarica');
    expect(component.success()).toBe('');
    expect(component.savedName()).toBe('');
  });

  it('allows manual coordinates when location search is unavailable', () => {
    const { component, http } = setup();
    component.searchForm.setValue({ query: 'Roma' });
    component.search();
    http.expectOne('api/v1/admin/weather-locations?q=Roma').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(component.error()).toContain('inserisci le coordinate');
    component.form.setValue({ name: 'Casa', latitude: 0, longitude: 0 });
    component.save();
    http.expectOne('api/v1/admin/weather-settings').flush({ location: component.form.getRawValue(), version: 2 });
    expect(component.success()).toContain('salvata');
  });
});
