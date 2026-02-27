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
        if (this.shouldRedirectToLogin(error)) {
          this.redirectToLogin();
        }
        return throwError(error);
      })
    );
  }

  private shouldRedirectToLogin(error: HttpErrorResponse): boolean {
    if (!error) return false;
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
    redirectingToLogin = true;
    window.location.assign(this.getLoginUrl());
  }

  private getLoginUrl(): string {
    const path = window.location.pathname || '';
    const markers = ['/shopping', '/notes', '/tasks', '/recipes', '/meals'];

    for (let i = 0; i < markers.length; i++) {
      const idx = path.indexOf(markers[i]);
      if (idx >= 0) {
        return path.substring(0, idx) + '/login.php';
      }
    }
    return '/login.php';
  }
}
