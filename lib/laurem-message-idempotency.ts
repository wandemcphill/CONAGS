const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export function readLauremIdempotencyKey(request: Request) {
  const value = request.headers.get('Idempotency-Key')?.trim() || '';
  if (!value || value.length < 8 || value.length > MAX_IDEMPOTENCY_KEY_LENGTH) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) return null;
  return value;
}
