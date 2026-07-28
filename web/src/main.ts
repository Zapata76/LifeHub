import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { csrfInterceptor } from './app/core/csrf.interceptor';

const localHost = ['127.0.0.1', 'localhost'].includes(window.location.hostname);

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptors([csrfInterceptor])),
    provideRouter(routes, withEnabledBlockingInitialNavigation()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && !localHost,
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
}).catch((error: unknown) => console.error(error));
