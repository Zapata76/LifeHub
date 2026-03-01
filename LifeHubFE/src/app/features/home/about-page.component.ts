import { Component } from '@angular/core';

@Component({
  selector: 'app-about-page',
  template: `
    <div class="container dark-theme">
      <header>
        <div class="header-content">
          <div class="header-row">
            <h1 class="page-title">Credits</h1>
            <a routerLink="/home" class="home-link">Home Hub</a>
          </div>
        </div>
      </header>

      <main class="content">
        <section class="card profile-card">
          <div class="profile-header">
            <div class="avatar-placeholder">EM</div>
            <div class="profile-titles">
              <h2>Emiliano Maugeri</h2>
              <p class="subtitle">Full Stack Developer & Creator of Life Hub</p>
            </div>
          </div>

          <div class="bio">
            <p>
              PM & developer passionate about creating useful tools for life improvement. 
              <br>Life Hub was born from the need to unify family management into a single, 
              private, and efficient digital space.
            </p>
          </div>

          <div class="social-links">
            <a href="https://github.com/Zapata76" target="_blank" class="social-btn github">
              <span class="icon"></span> GitHub
            </a>
            <a href="https://www.emilianomaugeri.it" target="_blank" class="social-btn website">
              <span class="icon"></span> Website
            </a>
            <a href="https://www.linkedin.com/in/emiliano-maugeri-710395a6/" target="_blank" class="social-btn linkedin">
              <span class="icon"></span> LinkedIn
            </a>
          </div>
        </section>

        <section class="card project-card">
          <h3>About Life Hub</h3>
          <p>
            Life Hub is a comprehensive web application designed to simplify family organization. 
            It features modules for meal planning, shared notes, task management, recipe archiving, 
            and real-time shopping lists.
          </p>
          <div class="license-info">
            <p>Released under the <strong>GNU General Public License v3.0</strong></p>
          </div>
        </section>
      </main>
    </div>
  `,
  styles: [`
    .dark-theme { background-color: #121212; color: #e4e4e4; min-height: 100vh; font-family: system-ui, sans-serif; }
    header { background-color: #1e1e1e; border-bottom: 1px solid #2a2a2a; padding: 15px 20px; }
    .header-row { display: flex; justify-content: space-between; align-items: center; max-width: 800px; margin: 0 auto; }
    .page-title { color: #4f8cff; font-size: 1.4rem; margin: 0; }
    .home-link { color: #9aa0a6; text-decoration: none; font-size: 0.85rem; border: 1px solid #333; padding: 6px 12px; border-radius: 6px; background: #2a2a2a; transition: 0.2s; }
    .home-link:hover { border-color: #4f8cff; color: #fff; }

    main.content { max-width: 800px; margin: 40px auto; padding: 0 20px; display: flex; flex-direction: column; gap: 24px; }
    .card { background-color: #1e1e1e; border-radius: 16px; padding: 30px; border: 1px solid #2a2a2a; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    
    .profile-header { display: flex; align-items: center; gap: 20px; margin-bottom: 24px; }
    .avatar-placeholder { width: 80px; height: 80px; background: linear-gradient(135deg, #4f8cff, #2d5eb3); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; color: white; }
    .profile-titles h2 { margin: 0; font-size: 1.8rem; }
    .subtitle { margin: 4px 0 0; color: #4f8cff; font-weight: 500; }

    .bio { line-height: 1.6; color: #b0b0b0; font-size: 1.1rem; margin-bottom: 30px; }

    .social-links { display: flex; gap: 12px; flex-wrap: wrap; }
    .social-btn { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.95rem; transition: 0.2s; color: white; }
    .github { background-color: #333; }
    .github:hover { background-color: #444; }
    .website { background-color: #4f8cff; }
    .website:hover { background-color: #639aff; }
    .linkedin { background-color: #0077b5; }
    .linkedin:hover { background-color: #0088ce; }

    .project-card h3 { margin-top: 0; color: #4f8cff; margin-bottom: 16px; }
    .project-card p { line-height: 1.6; color: #b0b0b0; }
    .license-info { margin-top: 20px; padding-top: 20px; border-top: 1px solid #2a2a2a; font-size: 0.9rem; color: #888; }
    .license-info strong { color: #e4e4e4; }

    @media (max-width: 600px) {
      .profile-header { flex-direction: column; text-align: center; }
      .social-links { justify-content: center; }
      .avatar-placeholder { width: 100px; height: 100px; }
    }
  `]
})
export class AboutPageComponent {}
