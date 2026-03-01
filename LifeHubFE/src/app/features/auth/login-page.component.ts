import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { RuntimeConfigService } from '../../core/runtime-config.service';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.css']
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
