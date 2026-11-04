// The product's only log lines (hardening task H-1, docs/09-CONTRACT-R1.1.md
// section 4). Workers Logs keeps what the Worker writes to the console for
// three days in the owner's Cloudflare account, so every line goes through
// here and nowhere else (test/guards/log-redaction.test.ts):
// - a line is one fixed event name and, for a failure, the error's name and a
//   short message, as one JSON object;
// - nothing a person typed or holds is ever passed in: no password, no reset
//   link or token, no mobile number, no session cookie or id;
// - the message is still scrubbed, in case an error carries a value: a list
//   in square brackets (how a failed statement repeats the values it was
//   given, such as a name or a mark; release 2, R2-b), every token-like run
//   of 32 characters or more (reset tokens, session tokens and ids, hashes),
//   of 16 or more with a digit in it, or in the recovery code's shape, and
//   every run of seven or more digits (mobile numbers), becomes [redacted]; a
//   plain name such as PASSWORD_ITERATIONS stays readable;
// - a failed read or write of results says only so, with a fixed message
//   (src/exams.ts), so no mark or learner name reaches a line;
// - a failed lesson-view write (R2-d, AT-15i) is the fixed event alone, with
//   no error text at all: no name, no lesson title, no lesson or learner id;
// - a line is at most a few hundred characters, so the free plan's allowance
//   is counted in lines (README "Logs").
// Request logs (one line per request, with its address) are off in
// wrangler.jsonc: a reset link's token is part of its address.

/** Every event the product logs. */
export type LogEvent = 'usage flush failed' | 'request failed' | 'activity write failed';

const MESSAGE_MAX = 200;
const REDACTED = '[redacted]';

/** Removes token-like runs and long digit runs from a message, and shortens it. */
export function redact(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, REDACTED)
    .replace(/[A-Za-z0-9_\-+/=]{16,}/g, (run) => (run.length >= 32 || /\d/.test(run) ? REDACTED : run))
    .replace(/\b[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}\b/g, REDACTED)
    .replace(/\+?\d(?:[\s().-]*\d){6,}/g, REDACTED)
    .slice(0, MESSAGE_MAX);
}

/** The line written for an event: one JSON object, nothing taken from a request. */
export function logLine(event: LogEvent, err?: unknown): string {
  if (err === undefined) return JSON.stringify({ event });
  const name = err instanceof Error ? err.name : typeof err;
  const message = err instanceof Error ? err.message : String(err);
  return JSON.stringify({ event, error: redact(name), message: redact(message) });
}

/** Writes one product log line (the only console call in src/). */
export function logError(event: LogEvent, err?: unknown): void {
  console.error(logLine(event, err));
}
