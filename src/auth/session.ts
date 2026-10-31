// Server-side sessions. Not implemented yet.
export const SESSION_IDLE_MS: number = 0;
export function sessionDecision(_expiresAt: number, _now: number): 'valid' | 'refresh' | 'expired' {
  throw new Error('not implemented');
}
