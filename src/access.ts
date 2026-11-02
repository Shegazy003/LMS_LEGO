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
 * or after its end date (both dates included, UTC calendar days). A membership
 * ended with "End access now" (endedOn, release 1.1) is ended at once,
 * whatever its dates say. */
export function membershipStatus(
  validFrom: string,
  validUntil: string,
  nowMs: number,
  endedOn: string | null = null,
): 'not-started' | 'active' | 'ended' {
  if (endedOn) return 'ended';
  const today = utcDate(nowMs);
  if (today < validFrom) return 'not-started';
  return membershipActive(validUntil, nowMs) ? 'active' : 'ended';
}

/** The day an ended membership ended: the day of "End access now", else its end date. */
export function endedDate(validUntil: string, endedOn: string | null): string {
  return endedOn ?? validUntil;
}

export type TypedEndDate = { ok: true } | { ok: false; error: 'endDateInvalid' | 'endDateBeyondOwn' };

/** A typed end date (release 1 rules 2 and 3; release 1.1 AT-6): a real date,
 * not before today, and not later than the granter's own end date (none for
 * the owner). The rule is for typed dates only. */
export function checkTypedEndDate(date: string, nowMs: number, ownEnd: string | null): TypedEndDate {
  if (!isIsoDate(date) || date < utcDate(nowMs)) return { ok: false, error: 'endDateInvalid' };
  if (ownEnd !== null && date > ownEnd) return { ok: false, error: 'endDateBeyondOwn' };
  return { ok: true };
}
