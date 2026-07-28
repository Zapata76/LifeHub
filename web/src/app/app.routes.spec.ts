import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';

describe('application routes', () => {
  it('protects the administration URL with the admin guard', () => {
    const children = routes.find((route) => route.path === '')?.children ?? [];
    expect(children.find((route) => route.path === 'admin')?.canActivate).toBeTruthy();
  });

  it('routes goals to the dedicated module workspace', () => {
    const children = routes.find((route) => route.path === '')?.children ?? [];
    expect(children.find((route) => route.path === 'moduli/goals')?.loadComponent).toBeTruthy();
  });

  it('routes documents to the dedicated archive workspace', () => {
    const children = routes.find((route) => route.path === '')?.children ?? [];
    expect(children.find((route) => route.path === 'moduli/documents')?.loadComponent).toBeTruthy();
  });
});
