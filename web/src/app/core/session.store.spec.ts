import { describe, expect, it } from 'vitest';
import { SessionStore } from './session.store';

describe('SessionStore', () => {
  it('does not expose an authenticated user after clear', () => {
    const store = new SessionStore();
    store.set({ id: 1, householdId: 1, role: 'admin', username: 'admin' }, 'csrf');
    expect(store.authenticated()).toBe(true);
    store.clear();
    expect(store.authenticated()).toBe(false);
    expect(store.csrfToken()).toBe('');
  });
});
