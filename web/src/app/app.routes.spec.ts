import { describe, expect, it } from 'vitest';
import { FEATURE_STYLESHEET_DATA_KEY } from './core/feature-stylesheet.loader';
import { routes } from './app.routes';

describe('application routes', () => {
  it('protects the administration URL with the admin guard', () => {
    const children = routes.find((route) => route.path === '')?.children ?? [];
    expect(children.find((route) => route.path === 'admin')?.canActivate).toBeTruthy();
  });

  it('routes goals to the dedicated module workspace', () => {
    const children = routes.find((route) => route.path === '')?.children ?? [];
    expect(children.find((route) => route.path === 'goals')?.loadComponent).toBeTruthy();
  });

  it('routes documents to the dedicated archive workspace', () => {
    const children = routes.find((route) => route.path === '')?.children ?? [];
    expect(children.find((route) => route.path === 'documents')?.loadComponent).toBeTruthy();
  });

  it('loads the matching external stylesheet for every feature route', () => {
    const children = routes.find((route) => route.path === '')?.children ?? [];
    const featureRoutes = [
      ...routes.filter((route) => route.loadComponent),
      ...children.filter((route) => route.loadComponent)
    ];
    const stylesheetByPath = Object.fromEntries(featureRoutes.map((route) => [
      route.path || '(home)',
      route.data?.[FEATURE_STYLESHEET_DATA_KEY]
    ]));

    expect(stylesheetByPath).toEqual({
      login: 'login',
      about: 'about',
      '(home)': 'home',
      tasks: 'tasks',
      shopping: 'shopping',
      meals: 'meals',
      recipes: 'recipes',
      inventory: 'inventory',
      notes: 'notes',
      documents: 'documents',
      calendars: 'calendars',
      goals: 'goals',
      admin: 'user-management'
    });
    expect(featureRoutes.every((route) => route.resolve?.['stylesheet'])).toBe(true);
  });
});
