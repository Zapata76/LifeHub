interface ApiErrorEnvelope {
  error?: unknown;
  message?: unknown;
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
  const message = nested?.message ?? body?.message;
  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
}
