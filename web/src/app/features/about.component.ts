/** Presents project credits with safe external links. */

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading credits-heading">
      <div><p class="eyebrow">Project Credits</p><h1>Credits</h1></div>
      <a class="button quiet" routerLink="/">Home Hub</a>
    </div>
    <div class="credits-content">
      <section class="card credits-card" aria-labelledby="developer-name">
        <div class="profile-header">
          <div class="avatar-placeholder" aria-hidden="true">EM</div>
          <div><h2 id="developer-name">Emiliano Maugeri</h2>
            <p class="credits-subtitle">Full Stack Developer &amp; Creator of Life Hub</p></div>
        </div>
        <p class="credits-bio">PM &amp; developer passionate about creating useful tools for life improvement.<br>
          Life Hub was born from the need to unify family management into a single, private, and efficient digital space.</p>
        <div class="social-links" aria-label="Collegamenti di Emiliano Maugeri">
          <a class="social-button github" href="https://github.com/Zapata76" target="_blank"
            rel="noopener noreferrer">GitHub</a>
          <a class="social-button website" href="https://www.emilianomaugeri.it" target="_blank"
            rel="noopener noreferrer">Website</a>
          <a class="social-button linkedin" href="https://www.linkedin.com/in/emiliano-maugeri-710395a6/"
            target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </div>
      </section>
      <section class="card credits-card project-credits" aria-labelledby="about-life-hub">
        <h2 id="about-life-hub">About Life Hub</h2>
        <p>Life Hub is a comprehensive web application designed to simplify family organization. It features modules
          for meal planning, shared notes, activity management, recipe archiving, and real-time shopping lists.</p>
        <p class="license-info">
          Released under the <strong>GNU Affero General Public License v3.0</strong>.
          <a href="https://github.com/Zapata76/LifeHub" target="_blank"
            rel="noopener noreferrer">Source code</a>
        </p>
      </section>
    </div>
  `
})
export class AboutComponent {}
