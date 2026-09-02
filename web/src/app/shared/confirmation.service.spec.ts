import { describe, expect, it } from 'vitest';
import { ConfirmationService } from './confirmation.service';

describe('ConfirmationService', () => {
  it('settles a replaced request and resolves the active choice', async () => {
    const service = new ConfirmationService();
    const first = service.confirm({ title: 'Prima', message: 'Prima richiesta' });
    const second = service.confirm({ title: 'Seconda', message: 'Seconda richiesta' });

    expect(await first).toBe(false);
    expect(service.current()?.title).toBe('Seconda');

    service.settle(true);
    expect(await second).toBe(true);
    expect(service.current()).toBeNull();
  });
});
