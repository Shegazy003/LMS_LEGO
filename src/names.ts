// Bounds on what people type as a username or a display name (task 5).
//
// - A username is 3 to 32 characters: a-z, digits, dot, dash, underscore.
//   Wherever one is typed (sign-in, recovery code, reset link, appoint forms)
//   it is read with typedUsername first: one longer than 32 characters cannot
//   be anybody's, so it is read as no username at all (''), which matches no
//   account and never builds a longer rate-limit key (src/auth/limits.ts).
// - A display name is 1 to 100 characters on one line: no control characters
//   (line breaks, tabs), no line or paragraph separators and no bidirectional
//   embedding, override or isolate controls. Display names go into the fixed
//   WhatsApp message, which must keep its own lines and stay short.
export const USERNAME_MAX = 32;
export const DISPLAY_NAME_MAX = 100;

const USERNAME = new RegExp(`^[a-z0-9._-]{3,${USERNAME_MAX}}$`);

/** Characters that would break a one-line name: controls, separators, bidi controls. */
export const NOT_ONE_LINE = /[\p{Cc}\p{Zl}\p{Zp}‪-‮⁦-⁩]/u;

export function isUsername(text: string): boolean {
  return USERNAME.test(text);
}

/** A username as typed: trimmed and lower-cased; longer than the maximum is ''. */
export function typedUsername(raw: string): string {
  const name = raw.trim().toLowerCase();
  return name.length <= USERNAME_MAX ? name : '';
}

/** One line of 1 to `max` characters (counted as characters, not UTF-16 units), trimmed; otherwise null. */
export function oneLine(raw: string, max: number): string | null {
  const text = raw.trim();
  if (!text || NOT_ONE_LINE.test(text)) return null;
  return [...text].length <= max ? text : null;
}

export function cleanDisplayName(raw: string): string | null {
  return oneLine(raw, DISPLAY_NAME_MAX);
}
