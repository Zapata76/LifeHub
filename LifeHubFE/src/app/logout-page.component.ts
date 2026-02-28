import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-logout-page',
  template: `<div style="padding:20px;font-family:system-ui,sans-serif;background:#121212;color:#e4e4e4;min-height:100vh;">Logout...</div>`
})
export class LogoutPageComponent implements OnInit {
  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit() {
    this.auth.logout().subscribe(
      () => this.router.navigateByUrl('/login'),
      () => this.router.navigateByUrl('/login')
    );
  }
}
