import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
    selector: 'app-logout-page',
    templateUrl: './logout-page.component.html',
    styleUrls: ['./logout-page.component.css'],
    standalone: false
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
