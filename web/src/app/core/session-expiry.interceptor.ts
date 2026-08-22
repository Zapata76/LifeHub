import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SessionStore } from './session.store';

const expiredSessionCodes = new Set(['auth.required', 'auth.revoked']);

export const sessionExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionStore);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (isExpiredSessionError(error)) {
        const redirectRequired = session.authenticated();
        session.clear();

        if (redirectRequired) {
          void router.navigate(['/login'], { replaceUrl: true });
        }
      }

      return throwError(() => error);
    })
  );
};

function isExpiredSessionError(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
    return false;
  }

  const response = error.error as { error?: { code?: unknown } } | null;
  const code = response?.error?.code;
  return typeof code === 'string' && expiredSessionCodes.has(code);
}
