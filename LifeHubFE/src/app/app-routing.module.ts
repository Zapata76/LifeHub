import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from './core/auth.guard';
import { RoleGuard } from './features/users/role.guard';
import { CalendarPageComponent } from './features/calendar/calendar-page.component';
import { HomePageComponent } from './features/home/home-page.component';
import { LoginPageComponent } from './features/auth/login-page.component';
import { LogoutPageComponent } from './features/auth/logout-page.component';
import { AboutPageComponent } from './features/home/about-page.component';
import { MealsPageComponent } from './features/meals/meals-page.component';
import { NotesPageComponent } from './features/notes/notes-page.component';
import { RecipesPageComponent } from './features/recipes/recipes-page.component';
import { ShoppingPageComponent } from './features/shopping/shopping-page.component';
import { TasksPageComponent } from './features/tasks/tasks-page.component';
import { UsersPageComponent } from './features/users/users-page.component';

const routes: Routes = [
  { path: 'login', component: LoginPageComponent },
  { path: 'logout', component: LogoutPageComponent },
  { path: 'about', component: AboutPageComponent },
  { path: 'home', component: HomePageComponent, canActivate: [AuthGuard] },
  { path: 'calendar', component: CalendarPageComponent, canActivate: [AuthGuard] },
  { path: 'shopping', component: ShoppingPageComponent, canActivate: [AuthGuard] },
  { path: 'spesa', redirectTo: 'shopping', pathMatch: 'full' },
  { path: 'recipes', component: RecipesPageComponent, canActivate: [AuthGuard] },
  { path: 'ricette', redirectTo: 'recipes', pathMatch: 'full' },
  { path: 'meals', component: MealsPageComponent, canActivate: [AuthGuard] },
  { path: 'menu', redirectTo: 'meals', pathMatch: 'full' },
  { path: 'notes', component: NotesPageComponent, canActivate: [AuthGuard] },
  { path: 'tasks', component: TasksPageComponent, canActivate: [AuthGuard] },
  {
    path: 'users',
    component: UsersPageComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['admin'] }
  },
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
