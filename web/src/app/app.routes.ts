import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { adminGuard } from './core/admin.guard';
import {
  FEATURE_STYLESHEET_DATA_KEY,
  FeatureStylesheetName,
  featureStylesheetResolver
} from './core/feature-stylesheet.loader';

const withFeatureStylesheet = (name: FeatureStylesheetName) => ({
  data: { [FEATURE_STYLESHEET_DATA_KEY]: name },
  resolve: { stylesheet: featureStylesheetResolver }
});

export const routes: Routes = [
  {
    path: 'login',
    ...withFeatureStylesheet('login'),
    loadComponent: () => import('./features/login.component').then((module) => module.LoginComponent)
  },
  {
    path: 'about',
    ...withFeatureStylesheet('about'),
    loadComponent: () => import('./features/about.component').then((module) => module.AboutComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        ...withFeatureStylesheet('home'),
        loadComponent: () => import('./features/home.component').then((module) => module.HomeComponent)
      },
      {
        path: 'tasks',
        ...withFeatureStylesheet('tasks'),
        loadComponent: () => import('./features/tasks.component').then((module) => module.TasksComponent)
      },
      {
        path: 'shopping',
        ...withFeatureStylesheet('shopping'),
        loadComponent: () => import('./features/shopping/shopping-page.component')
          .then((module) => module.ShoppingPageComponent)
      },
      {
        path: 'moduli/meals',
        ...withFeatureStylesheet('meals'),
        loadComponent: () => import('./features/meals/meals-page.component')
          .then((module) => module.MealsPageComponent)
      },
      {
        path: 'moduli/recipes',
        ...withFeatureStylesheet('recipes'),
        loadComponent: () => import('./features/recipes/recipes-page.component')
          .then((module) => module.RecipesPageComponent)
      },
      {
        path: 'moduli/inventory',
        ...withFeatureStylesheet('inventory'),
        loadComponent: () => import('./features/inventory/inventory-page.component')
          .then((module) => module.InventoryPageComponent)
      },
      {
        path: 'moduli/notes',
        ...withFeatureStylesheet('notes'),
        loadComponent: () => import('./features/notes/notes-page.component')
          .then((module) => module.NotesPageComponent)
      },
      {
        path: 'moduli/documents',
        ...withFeatureStylesheet('documents'),
        loadComponent: () => import('./features/documents/documents-page.component')
          .then((module) => module.DocumentsPageComponent)
      },
      {
        path: 'moduli/calendars',
        ...withFeatureStylesheet('calendars'),
        loadComponent: () => import('./features/calendars/calendars-page.component')
          .then((module) => module.CalendarsPageComponent)
      },
      {
        path: 'moduli/goals',
        ...withFeatureStylesheet('goals'),
        loadComponent: () => import('./features/goals/goals-page.component')
          .then((module) => module.GoalsPageComponent)
      },
      {
        path: 'admin',
        ...withFeatureStylesheet('user-management'),
        canActivate: [adminGuard],
        loadComponent: () => import('./features/user-management.component')
          .then((module) => module.UserManagementComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
