import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

interface WeatherLocation { name: string; latitude: number; longitude: number; }
interface WeatherSettings { location: WeatherLocation | null; version: number; }

@Component({
  selector: 'lh-weather-settings',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card editor admin-home-settings" aria-labelledby="weather-settings-title">
      <div><p class="eyebrow">Email giornaliera</p><h2 id="weather-settings-title">Meteo di oggi</h2></div>
      <p class="muted">Scegli una località per aggiungere alla mail le previsioni del giorno:
        condizioni, temperature minima e massima e probabilità di pioggia.</p>
      @if (loading()) { <p role="status">Caricamento impostazioni meteo…</p> }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
        <button type="button" (click)="load()" [disabled]="busy() || loading()">Ricarica impostazioni meteo</button>
      }
      @if (success()) { <p class="success" role="status">{{ success() }}</p> }
      <p class="muted">{{ savedName() ? 'Località salvata: ' + savedName() : 'Meteo non attivo nelle email.' }}</p>
      <form [formGroup]="searchForm" (ngSubmit)="search()" class="form-grid" role="search">
        <label>Cerca località
          <input formControlName="query" maxlength="100" placeholder="Es. Catania" [readOnly]="searching()">
        </label>
        <button type="submit" [disabled]="searchForm.invalid || searching() || busy() || loading()">
          {{ searching() ? 'Ricerca…' : 'Cerca località' }}
        </button>
      </form>
      @if (searched() && !searching() && results().length === 0) {
        <p role="status">Nessuna località trovata. Prova un altro nome o inserisci le coordinate.</p>
      }
      <div class="weather-results" aria-label="Località trovate">
        @for (location of results(); track $index) {
          <button type="button" (click)="select(location)" [disabled]="busy() || loading()">
            {{ location.name }} · {{ location.latitude }}, {{ location.longitude }}
          </button>
        }
      </div>
      <form [formGroup]="form" (ngSubmit)="save()">
        <fieldset class="form-grid weather-fields" [disabled]="busy() || loading()">
          <legend>Località o punto personalizzato</legend>
          <label>Nome<input formControlName="name" maxlength="190" placeholder="Es. Casa"></label>
          <label>Latitudine
            <input type="number" formControlName="latitude" min="-90" max="90" step="any" placeholder="Es. 37.50">
          </label>
          <label>Longitudine
            <input type="number" formControlName="longitude" min="-180" max="180" step="any" placeholder="Es. 15.09">
          </label>
        </fieldset>
        <div class="actions">
          <button class="primary" type="submit" [disabled]="form.invalid || busy() || loading() || version() === null">
            {{ busy() ? 'Salvataggio…' : 'Salva località meteo' }}
          </button>
          @if (savedName()) {
            <button type="button" (click)="remove()" [disabled]="busy() || loading()">Disattiva meteo nelle email</button>
          }
        </div>
      </form>
      <p class="muted">La località vale per tutta la famiglia. Dati forniti da
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>.
        Se le previsioni non sono disponibili, la mail viene inviata comunque.</p>
    </section>
  `
})
export class WeatherSettingsComponent {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly savedName = signal('');
  readonly version = signal<number | null>(null);
  readonly results = signal<WeatherLocation[]>([]);
  readonly searchForm = new FormGroup({
    query: new FormControl('', { nonNullable: true, validators: [
      Validators.required, Validators.minLength(2), Validators.maxLength(100)
    ] })
  });
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(190)] }),
    latitude: new FormControl<number | null>(null, [Validators.required, Validators.min(-90), Validators.max(90)]),
    longitude: new FormControl<number | null>(null, [Validators.required, Validators.min(-180), Validators.max(180)])
  });

  constructor() { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<WeatherSettings>('api/v1/admin/weather-settings').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (settings) => { this.apply(settings); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('Impossibile caricare le impostazioni meteo.'); }
    });
  }

  search(): void {
    const query = this.searchForm.controls.query.value.trim();
    if (query.length < 2 || query.length > 100 || this.searching()) return;
    this.searching.set(true);
    this.searched.set(false);
    this.results.set([]);
    this.error.set('');
    this.http.get<{ items: WeatherLocation[] }>('api/v1/admin/weather-locations', { params: { q: query } })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ items }) => { this.results.set(items); this.searched.set(true); this.searching.set(false); },
        error: () => {
          this.searching.set(false);
          this.error.set('Ricerca non disponibile. Riprova o inserisci le coordinate.');
        }
      });
  }

  select(location: WeatherLocation): void {
    this.form.setValue(location);
    this.form.markAsDirty();
    this.results.set([]);
    this.searched.set(false);
    this.success.set('Località selezionata. Premi “Salva località meteo” per confermare.');
  }

  save(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    if (value.latitude === null || value.longitude === null || !value.name.trim()) return;
    this.persist({ name: value.name.trim(), latitude: value.latitude, longitude: value.longitude });
  }

  remove(): void { this.persist(null); }

  private persist(location: WeatherLocation | null): void {
    if (this.busy() || this.loading() || this.version() === null) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    this.http.put<WeatherSettings>('api/v1/admin/weather-settings', { location, version: this.version() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (settings) => {
          this.apply(settings);
          this.busy.set(false);
          this.success.set(location ? 'Località meteo salvata.' : 'Meteo disattivato nelle email.');
        },
        error: (failure: unknown) => {
          this.busy.set(false);
          this.error.set(failure instanceof HttpErrorResponse && failure.status === 409
            ? 'La località è stata modificata. Ricarica le impostazioni prima di salvare.'
            : 'Salvataggio della località meteo non riuscito.');
        }
      });
  }

  private apply(settings: WeatherSettings): void {
    this.version.set(settings.version);
    this.savedName.set(settings.location?.name ?? '');
    this.form.reset(settings.location ?? { name: '', latitude: null, longitude: null });
  }
}
