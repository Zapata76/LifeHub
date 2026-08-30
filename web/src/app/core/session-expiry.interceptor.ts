import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { SessionExpiryService } from './session-expiry.service';

const expiredSessionCodes = new Set(['auth.required', 'auth.revoked']);

export const sessionExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  const sessionExpiry = inject(SessionExpiryService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (isExpiredSessionError(error)) {
        sessionExpiry.handle();
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
