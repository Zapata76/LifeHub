import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { RuntimeConfigService } from '../../core/runtime-config.service';

@Component({
  selector: 'app-login-page',
  template: `
    <div class="wrap">
      <form class="card" (submit)="doLogin($event)">
        <h1>{{ appTitle }}</h1>
        <p class="err" *ngIf="error">{{ error }}</p>
        <label>Username</label>
        <input type="text" [(ngModel)]="username" name="username" required>
        <label>Password</label>
        <input type="password" [(ngModel)]="password" name="password" required>
        <button type="submit" [disabled]="loading">{{ loading ? 'Accesso...' : 'Accedi' }}</button>
      </form>
    </div>
  `,
  styles: [`
    .wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#121212; color:#e4e4e4; font-family:system-ui,sans-serif; }
    .card { width:100%; max-width:400px; background:#1e1e1e; border:1px solid #2a2a2a; border-radius:12px; padding:24px; display:flex; flex-direction:column; gap:10px; }
    h1 { margin:0 0 8px; color:#4f8cff; text-align:center; }
    label { color:#9aa0a6; font-size:0.9rem; }
    input { width:100%; box-sizing:border-box; padding:12px; border-radius:8px; border:1px solid #333; background:#121212; color:#fff; }
    button { margin-top:6px; padding:12px; border:none; border-radius:8px; background:#4f8cff; color:#fff; font-weight:700; cursor:pointer; }
    .err { margin:0; color:#ff6f6f; background:#301b1b; border:1px solid #5d2d2d; border-radius:8px; padding:8px; }
  `]
})
export class LoginPageComponent implements OnInit {
  appTitle = 'Life Hub';
  username = '';
  password = '';
  loading = false;
  error = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private runtimeConfig: RuntimeConfigService
  ) {}

  ngOnInit() {
    this.appTitle = this.runtimeConfig.appTitle;
    this.auth.me().subscribe(
      () => this.router.navigateByUrl('/home'),
      () => {}
    );
  }

  doLogin(evt: Event) {
    evt.preventDefault();
    this.error = '';
    this.loading = true;
    this.auth.login(this.username, this.password).subscribe(
      () => {
        this.loading = false;
        this.router.navigateByUrl('/home');
      },
      err => {
        this.loading = false;
        this.error = err && err.error && err.error.error ? err.error.error : 'Login fallito';
      }
    );
  }
}
