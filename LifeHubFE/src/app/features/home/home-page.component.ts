import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, HubUser } from '../../core/auth.service';
import { RuntimeConfigService } from '../../core/runtime-config.service';

@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.css']
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
