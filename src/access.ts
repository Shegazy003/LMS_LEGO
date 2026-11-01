// Membership validity. Dates are UTC calendar days (YYYY-MM-DD). A membership
// starts at the beginning of its start date (valid_from), is active up to and
// including its end date (valid_until), and ends at the start of the
// following UTC day.

const DAY_MS = 86_400_000;

export function utcDate(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(text + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

export function addDays(date: string, days: number): string {
  return utcDate(Date.parse(date + 'T00:00:00Z') + days * DAY_MS);
}

export function membershipActive(validUntil: string, nowMs: number): boolean {
  return utcDate(nowMs) <= validUntil;
}

/** Where a membership stands today: before its start date, within its dates,
 * or after its end date (both dates included, UTC calendar days). */
export function membershipStatus(validFrom: string, validUntil: string, nowMs: number): 'not-started' | 'active' | 'ended' {
  const today = utcDate(nowMs);
  if (today < validFrom) return 'not-started';
  return membershipActive(validUntil, nowMs) ? 'active' : 'ended';
}
