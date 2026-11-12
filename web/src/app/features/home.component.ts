/** Presents the household dashboard, module icons, and project credits entry point. */

import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../core/session.store';
import { TodayWeatherComponent } from './today-weather.component';

const MODULES = [
  { title: 'Attività', key: 'tasks', description: 'Attività da fare, in corso e completate', icon: '✅' },
  { title: 'Calendari', key: 'calendars', description: 'Date condivise e calendari Google', icon: '📅' },
  { title: 'Note', key: 'notes', description: 'Pensieri, appunti e promemoria', icon: '📝' },
  { title: 'Spesa', key: 'shopping', description: 'Lista, prodotti, supermercati e prezzi', icon: '🛒' },
  { title: 'Ricette', key: 'recipes', description: 'Ricette e ingredienti senza perdita', icon: '📖' },
  { title: 'Pasti', key: 'meals', description: 'Pranzi, cene e pianificazione', icon: '🍽️' },
  { title: 'Documenti', key: 'documents', description: 'Metadati e allegati privati', icon: '📂' },
  { title: 'Inventario', key: 'inventory', description: 'Oggetti, luoghi e documenti', icon: '📦' },
  { title: 'Obiettivi', key: 'goals', description: 'Tracker e progressi quotidiani', icon: '🎯' },
  { title: 'Admin', key: 'admin', description: 'Configurazione, account e ruoli familiari', icon: '⚙️' }
] as const;

interface Dashboard {
  homeEyebrow: string;
  homeTitle: string;
  openTasks: number;
  uncheckedShoppingItems: number | null;
  upcomingMeals: number;
  activeGoals: number;
}

@Component({
  standalone: true,
  host: { class: 'home-page' },
  imports: [RouterLink, TodayWeatherComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <div><p class="eyebrow">{{ metrics()?.homeEyebrow || 'Oggi in famiglia' }}</p>
        <h1>{{ metrics()?.homeTitle || 'Simona puzzona' }}</h1></div>
    </section>
    @if (metrics(); as summary) {
      <section class="card metric-grid" aria-label="Riepilogo personale">
        <div class="metric"><strong>{{ summary.openTasks }}</strong><span>attività aperte</span></div>
        @if (summary.uncheckedShoppingItems !== null) {
          <div class="metric"><strong>{{ summary.uncheckedShoppingItems }}</strong><span>articoli da prendere</span></div>
        }
        <div class="metric"><strong>{{ summary.upcomingMeals }}</strong><span>pasti nei prossimi 7 giorni</span></div>
        <div class="metric"><strong>{{ summary.activeGoals }}</strong><span>obiettivi attivi</span></div>
      </section>
    }
    <lh-today-weather />
    <section aria-labelledby="modules-title">
      <h2 id="modules-title">Il tuo hub</h2>
      <div class="card-grid">
        @for (module of modules(); track module.key) {
          <a class="card module-card" [routerLink]="moduleLink(module.key)">
            <div class="module-heading">
              <span class="module-icon" aria-hidden="true">{{ module.icon }}</span><h3>{{ module.title }}</h3>
            </div>
            <p>{{ module.description }}</p>
          </a>
        }
      </div>
    </section>
    <footer class="home-footer">
      <a routerLink="/about">Project Credits &amp; Developer</a>
    </footer>
  `
})
export class HomeComponent {
  private readonly session = inject(SessionStore);
  readonly modules = computed(() => {
    const role = this.session.user()?.role;
    return MODULES.filter((module) => (module.key !== 'admin' || role === 'admin')
      && (module.key !== 'documents' || role === 'admin' || role === 'adult'));
  });
  readonly metrics = signal<Dashboard | null>(null);
  private readonly http = inject(HttpClient);

  constructor() {
    this.http.get<Dashboard>('api/v1/dashboard').subscribe({ next: (metrics) => this.metrics.set(metrics) });
  }

  moduleLink(key: string): string[] {
    return ['/', key];
  }
}
