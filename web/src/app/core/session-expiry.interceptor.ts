import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { EMPTY, catchError, switchMap, tap, throwError } from 'rxjs';
import { SessionExpiryService } from './session-expiry.service';
import { SessionStore } from './session.store';

const expiredSessionCodes = new Set(['auth.required', 'auth.revoked']);

export const sessionExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  const sessionExpiry = inject(SessionExpiryService);
  const session = inject(SessionStore);

  return next(request).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && /(?:^|\/)api\/v1\/auth\/session(?:\?|$)/.test(request.url)
        && session.authenticated() && (event.body as { authenticated?: boolean } | null)?.authenticated === false) {
        sessionExpiry.handle();
      }
    }),
    catchError((error: unknown) => {
      if (isExpiredSessionError(error)) {
        sessionExpiry.handle();
        return EMPTY;
      }
      if (error instanceof HttpErrorResponse && error.status === 403 && error.error?.error?.code === 'csrf.invalid'
        && !/(?:^|\/)auth\/login(?:\?|$)/.test(request.url)) {
        return sessionExpiry.verify().pipe(switchMap((active) => active === false ? EMPTY : throwError(() => error)));
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
