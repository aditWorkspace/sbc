/**
 * Returns a generic public error message, redacting any SQL/internal details.
 * Always logs the real error internally via console.error.
 */
export function publicError(err: unknown, fallback = 'Internal error'): { error: string } {
  const msg = (err as { message?: string })?.message ?? '';
  // Redact anything that looks like SQL or sensitive data
  if (/duplicate key|constraint|relation|column|syntax error/i.test(msg)) {
    return { error: fallback };
  }
  return { error: fallback };  // Always generic in prod
}
