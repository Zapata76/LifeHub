import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { adminGuard } from './core/admin.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login.component').then((module) => module.LoginComponent)
  },
  {
    path: 'about',
    loadComponent: () => import('./features/about.component').then((module) => module.AboutComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home.component').then((module) => module.HomeComponent)
      },
      {
        path: 'tasks',
        loadComponent: () => import('./features/tasks.component').then((module) => module.TasksComponent)
      },
      {
        path: 'shopping',
        loadComponent: () => import('./features/shopping/shopping-page.component')
          .then((module) => module.ShoppingPageComponent)
      },
      {
        path: 'moduli/meals',
        loadComponent: () => import('./features/meals/meals-page.component')
          .then((module) => module.MealsPageComponent)
      },
      {
        path: 'moduli/recipes',
        loadComponent: () => import('./features/recipes/recipes-page.component')
          .then((module) => module.RecipesPageComponent)
      },
      {
        path: 'moduli/inventory',
        loadComponent: () => import('./features/inventory/inventory-page.component')
          .then((module) => module.InventoryPageComponent)
      },
      {
        path: 'moduli/notes',
        loadComponent: () => import('./features/notes/notes-page.component')
          .then((module) => module.NotesPageComponent)
      },
      {
        path: 'moduli/documents',
        loadComponent: () => import('./features/documents/documents-page.component')
          .then((module) => module.DocumentsPageComponent)
      },
      {
        path: 'moduli/calendars',
        loadComponent: () => import('./features/calendars/calendars-page.component')
          .then((module) => module.CalendarsPageComponent)
      },
      {
        path: 'moduli/goals',
        loadComponent: () => import('./features/goals/goals-page.component')
          .then((module) => module.GoalsPageComponent)
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/user-management.component')
          .then((module) => module.UserManagementComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
