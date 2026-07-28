import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';
import { SessionStore } from './session.store';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const store = inject(SessionStore);
  const router = inject(Router);
  return auth.ensureSession().pipe(
    map((authenticated) => authenticated && store.user()?.role === 'admin'
      ? true
      : router.createUrlTree(['/']))
  );
};
