import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, HubUser } from './auth.service';
import { RuntimeConfigService } from './runtime-config.service';

@Component({
  selector: 'app-home-page',
  template: `
    <div class="shell">
      <header>
        <div class="logo">{{ appTitle }}</div>
        <div class="user-box" *ngIf="user">
          <div class="user-meta">
            <div class="u-name">{{ user.username }}</div>
            <div class="u-role">{{ user.role }}</div>
          </div>
          <button (click)="logout()">Logout</button>
        </div>
      </header>

      <main>
        <div class="grid">
          <a routerLink="/calendar" class="card">
            <div class="card-emoji">📅</div>
            <h3>Calendario</h3>
            <p>Google Calendar condiviso per appuntamenti e scadenze.</p>
          </a>
          <a routerLink="/shopping" class="card">
            <div class="card-emoji">🛒</div>
            <h3>Spesa</h3>
            <p>Lista della spesa in tempo reale.</p>
          </a>
          <a routerLink="/notes" class="card">
            <div class="card-emoji">📝</div>
            <h3>Note</h3>
            <p>Appunti e riflessioni condivise.</p>
          </a>
          <a routerLink="/tasks" class="card">
            <div class="card-emoji">✅</div>
            <h3>Attivita</h3>
            <p>Gestione dei task e delle cose da fare.</p>
          </a>
          <div class="card">
            <div class="card-emoji">📦</div>
            <h3>Inventario</h3>
            <p>Organizzazione e ricerca oggetti in casa.</p>
          </div>
          <div class="card">
            <div class="card-emoji">🎯</div>
            <h3>Obiettivi</h3>
            <p>Tracker progressi, abitudini e traguardi.</p>
          </div>
          <div class="card" *ngIf="user?.role === 'admin' || user?.role === 'adult'">
            <div class="card-emoji">📂</div>
            <h3>Documenti</h3>
            <p>Archivio digitale sicuro dei documenti di famiglia.</p>
          </div>
          <a routerLink="/meals" class="card">
            <div class="card-emoji">🍽️</div>
            <h3>Menu</h3>
            <p>Pianificazione pasti e menu settimanale.</p>
          </a>
          <a routerLink="/recipes" class="card">
            <div class="card-emoji">📖</div>
            <h3>Ricette</h3>
            <p>Archivio digitale delle ricette preferite.</p>
          </a>
          <a *ngIf="user?.role === 'admin'" routerLink="/users" class="card">
            <div class="card-emoji">⚙️</div>
            <h3>Gestione Utenti</h3>
            <p>Amministrazione ruoli e permessi del sistema.</p>
          </a>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .shell {
      min-height: 100vh;
      background: #121212;
      color: #e4e4e4;
      font-family: system-ui, -apple-system, sans-serif;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 2rem;
      background: #1e1e1e;
      border-bottom: 1px solid #2a2a2a;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .logo {
      color: #4f8cff;
      font-size: 1.5rem;
      font-weight: 700;
    }
    .user-box {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .user-meta {
      text-align: right;
    }
    .u-name {
      font-weight: 600;
      line-height: 1.1;
    }
    .u-role {
      color: #9aa0a6;
      font-size: 0.8rem;
      text-transform: uppercase;
    }
    button {
      border: 1px solid #ff5c5c;
      color: #ff5c5c;
      background: transparent;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: all .2s;
    }
    button:hover {
      background: #ff5c5c;
      color: #fff;
    }
    main {
      max-width: 1200px;
      margin: 40px auto;
      padding: 0 20px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }
    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      text-decoration: none;
      color: inherit;
      background: #1e1e1e;
      border: 1px solid transparent;
      border-radius: 12px;
      padding: 30px;
      transition: transform .2s, background-color .2s;
    }
    a.card:hover {
      border-color: #4f8cff;
      background: #2a2a2a;
      transform: translateY(-3px);
    }
    .card-emoji {
      font-size: 3rem;
      line-height: 1;
      margin-bottom: 15px;
    }
    .card h3 {
      color: #4f8cff;
      margin: 0 0 10px;
      font-size: 1.25rem;
      font-weight: 600;
    }
    .card p {
      margin: 0;
      color: #9aa0a6;
      font-size: 0.95rem;
    }
    @media (max-width: 600px) {
      header {
        flex-direction: column;
        gap: 15px;
        text-align: center;
      }
      .user-box { width: 100%; justify-content: center; }
      .grid {
        grid-template-columns: 1fr;
      }
    }
    @media (min-width: 601px) and (max-width: 1024px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
    }
  `]
})
export class HomePageComponent implements OnInit {
  user: HubUser | null = null;
  appTitle = 'Life Hub';

  constructor(
    private auth: AuthService,
    private router: Router,
    private runtimeConfig: RuntimeConfigService
  ) {}

  ngOnInit() {
    this.appTitle = this.runtimeConfig.appTitle;
    this.auth.user$.subscribe(u => this.user = u);
    if (!this.auth.user) {
      this.auth.me().subscribe();
    }
  }

  logout() {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }
}
