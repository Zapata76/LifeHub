import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SessionStore } from './session.store';

export const csrfInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(SessionStore).csrfToken();
  const unsafe = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase());
  const headers: Record<string, string> = {};
  if (unsafe && token) {
    headers['X-CSRF-Token'] = token;
  }
  return next(request.clone({ setHeaders: headers, withCredentials: true }));
};
