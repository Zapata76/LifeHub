import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

let redirectingToLogin = false;

@Injectable()
export class AuthRedirectInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (this.shouldRedirectToLogin(req, error)) {
          this.redirectToLogin();
        }
        return throwError(error);
      })
    );
  }

  private shouldRedirectToLogin(req: HttpRequest<any>, error: HttpErrorResponse): boolean {
    if (!error) return false;
    if (req.url.indexOf('auth.php?action=login') !== -1) return false;
    if (error.status === 401) return true;

    const payloadMsg =
      error.error && (error.error.error || error.error.message)
        ? String(error.error.error || error.error.message)
        : '';
    const msg = ((error.message || '') + ' ' + payloadMsg).toLowerCase();

    return msg.indexOf('non autorizzato') !== -1 || msg.indexOf('sessione scaduta') !== -1;
  }

  private redirectToLogin(): void {
    if (redirectingToLogin) return;
    if ((window.location.hash || '').indexOf('/login') !== -1) return;
    redirectingToLogin = true;
    const pathname = window.location.pathname || '/';
    const dir = pathname.endsWith('/') ? pathname : pathname.substring(0, pathname.lastIndexOf('/') + 1);
    const baseDir = dir || '/';
    window.location.assign(`${window.location.origin}${baseDir}#/login`);
  }
}
