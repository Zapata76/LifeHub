import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { AppUpdateService } from './app-update.service';

export const requestActivityInterceptor: HttpInterceptorFn = (request, next) => {
  const updates = inject(AppUpdateService);
  updates.beginRequest();
  return next(request).pipe(finalize(() => updates.endRequest()));
};
