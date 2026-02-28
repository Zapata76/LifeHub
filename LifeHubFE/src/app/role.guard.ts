import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const allowed = (route.data && route.data.roles ? route.data.roles : []) as string[];
    if (!allowed || allowed.length === 0) return of(true);

    const evaluate = () => {
      const user = this.auth.user;
      if (!user) return this.router.parseUrl('/login');
      return allowed.indexOf(user.role) !== -1 ? true : this.router.parseUrl('/home');
    };

    if (this.auth.user) return of(evaluate());

    return this.auth.me().pipe(
      map(() => evaluate()),
      catchError(() => of(this.router.parseUrl('/login')))
    );
  }
}
