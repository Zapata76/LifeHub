import { BrowserModule } from '@angular/platform-browser';
import { APP_INITIALIZER, NgModule } from '@angular/core';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthRedirectInterceptor } from './core/auth-redirect.interceptor';
import { ShoppingPageComponent } from './features/shopping/shopping-page.component';
import { RecipesPageComponent } from './features/recipes/recipes-page.component';
import { MealsPageComponent } from './features/meals/meals-page.component';
import { NotesPageComponent } from './features/notes/notes-page.component';
import { TasksPageComponent } from './features/tasks/tasks-page.component';
import { LoginPageComponent } from './features/auth/login-page.component';
import { HomePageComponent } from './features/home/home-page.component';
import { UsersPageComponent } from './features/users/users-page.component';
import { CalendarPageComponent } from './features/calendar/calendar-page.component';
import { LogoutPageComponent } from './features/auth/logout-page.component';
import { AboutPageComponent } from './features/home/about-page.component';
import { RuntimeConfigService } from './core/runtime-config.service';
import { ServiceWorkerModule } from '@angular/service-worker';
import { environment } from '../environments/environment';

export function initRuntimeConfig(runtimeConfig: RuntimeConfigService): () => Promise<void> {
  return () => runtimeConfig.load();
}

@NgModule({
  declarations: [
    AppComponent,
    ShoppingPageComponent,
    RecipesPageComponent,
    MealsPageComponent,
    NotesPageComponent,
    TasksPageComponent,
    LoginPageComponent,
    HomePageComponent,
    UsersPageComponent,
    CalendarPageComponent,
    LogoutPageComponent,
    AboutPageComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    ServiceWorkerModule.register('ngsw-worker.js', { enabled: environment.production })
  ],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: initRuntimeConfig,
      deps: [RuntimeConfigService],
      multi: true
    },
    { provide: HTTP_INTERCEPTORS, useClass: AuthRedirectInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
