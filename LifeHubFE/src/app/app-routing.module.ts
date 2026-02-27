import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { RoleGuard } from './role.guard';
import { CalendarPageComponent } from './calendar-page.component';
import { HomePageComponent } from './home-page.component';
import { LoginPageComponent } from './login-page.component';
import { LogoutPageComponent } from './logout-page.component';
import { MealsPageComponent } from './meals-page.component';
import { NotesPageComponent } from './notes-page.component';
import { RecipesPageComponent } from './recipes-page.component';
import { ShoppingPageComponent } from './shopping-page.component';
import { TasksPageComponent } from './tasks-page.component';
import { UsersPageComponent } from './users-page.component';

const routes: Routes = [
  { path: 'login', component: LoginPageComponent },
  { path: 'logout', component: LogoutPageComponent },
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
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
