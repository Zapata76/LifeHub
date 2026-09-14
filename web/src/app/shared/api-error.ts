interface ApiErrorEnvelope {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  status?: unknown;
}

function objectValue(value: unknown): ApiErrorEnvelope | null {
  return typeof value === 'object' && value !== null
    ? value as ApiErrorEnvelope
    : null;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  const response = objectValue(error);
  const body = objectValue(response?.error);
  const nested = objectValue(body?.error);
  if (response?.status === 401 && ['auth.required', 'auth.revoked'].includes(String(nested?.code))) {
    return 'La sessione è scaduta. Accedi nuovamente.';
  }
  if (response?.status === 403 && nested?.code === 'csrf.invalid') {
    return 'Il controllo di sicurezza è scaduto. Riprova a salvare.';
  }
  if (response?.status === 403) return 'Non hai i permessi per eseguire questa operazione.';
  if (response?.status === 0) return 'Connessione non disponibile. Controlla la rete e riprova.';
  const message = nested?.message ?? body?.message;
  if (typeof message === 'string' && message.trim() !== '') return message;
  if (response?.status === 409) return 'I dati sono stati modificati. Ricarica prima di riprovare.';
  return fallback;
}
