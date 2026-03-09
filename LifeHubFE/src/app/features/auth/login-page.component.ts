import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { RuntimeConfigService } from '../../core/runtime-config.service';

@Component({
    selector: 'app-login-page',
    templateUrl: './login-page.component.html',
    styleUrls: ['./login-page.component.css'],
    standalone: false
})
export class LoginPageComponent implements OnInit {
  appTitle = 'Life Hub';
  loginForm: FormGroup;
  loading = false;
  error = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private runtimeConfig: RuntimeConfigService,
    private fb: FormBuilder
  ) {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.appTitle = this.runtimeConfig.appTitle;
    this.auth.me().subscribe(
      () => this.router.navigateByUrl('/home'),
      () => {}
    );
  }

  doLogin(evt: Event) {
    evt.preventDefault();
    if (this.loginForm.invalid) {
      return;
    }
    this.error = '';
    this.loading = true;
    const { username, password } = this.loginForm.value;
    this.auth.login(username, password).subscribe(
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
