import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api-error';

describe('apiErrorMessage', () => {
  it.each([
    [401, 'auth.required', 'La sessione è scaduta. Accedi nuovamente.'],
    [403, 'csrf.invalid', 'Il controllo di sicurezza è scaduto. Riprova a salvare.'],
    [403, 'authorization.denied', 'Non hai i permessi per eseguire questa operazione.'],
    [0, '', 'Connessione non disponibile. Controlla la rete e riprova.'],
    [500, 'internal.error', 'Salvataggio non riuscito.']
  ])('distinguishes HTTP %s (%s) from a generic save error', (status, code, message) => {
    const error = new HttpErrorResponse({ status: Number(status), error: { error: { code } } });
    expect(apiErrorMessage(error, 'Salvataggio non riuscito.')).toBe(message);
  });

  it('preserves specific server errors, including business conflicts', () => {
    expect(apiErrorMessage({ status: 409, error: { error: {
      code: 'shopping.duplicate', message: 'Il prodotto è già presente.'
    } } }, 'Fallback')).toBe('Il prodotto è già presente.');
    expect(apiErrorMessage({ error: { message: 'Errore specifico.' } }, 'Fallback')).toBe('Errore specifico.');
  });

  it('uses a generic conflict message only when the server provides none', () => {
    expect(apiErrorMessage({ status: 409 }, 'Fallback')).toBe('I dati sono stati modificati. Ricarica prima di riprovare.');
    expect(apiErrorMessage(null, 'Fallback')).toBe('Fallback');
    expect(apiErrorMessage({ error: { error: { message: ' ' } } }, 'Fallback')).toBe('Fallback');
    expect(apiErrorMessage({ status: 401, error: { error: {
      code: 'auth.invalid_credentials', message: 'Credenziali non valide.'
    } } }, 'Fallback')).toBe('Credenziali non valide.');
  });
});
