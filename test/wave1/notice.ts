// The learner's lesson-activity notice as a page carries it (LMS wave 1, L1,
// contract section 7): which form, the one sentence of AT-15f, the detail,
// and the cookie that remembers "told once".
import { Client } from '../support/http.ts';

/** "full" (the card with Got it), "folded" (the one line with What is recorded), or null (no notice). */
export function noticeForm(html: string): 'full' | 'folded' | null {
  const full = html.includes('id="notice-card"');
  const folded = html.includes('id="notice-line"');
  if (full && folded) throw new Error('both forms on one page');
  return full ? 'full' : folded ? 'folded' : null;
}

/** The AT-15f sentence(s) on a page, exactly as test/at15/at15f.test.ts reads them. */
export const sentencesOf = (html: string) => html.match(/<p id="activity-notice"[^>]*>([^<]*)<\/p>/g)?.map((m) => m.replace(/<[^>]+>/g, '')) ?? [];

/** The session cookie a client holds (from its sign-in). */
export const sessionOf = (c: Client) => c.lastSetCookie.map((l) => l.match(/^lms_session=([^;]+)/)?.[1]).find(Boolean) ?? '';

/** The notice cookies a response sets. */
export const noticeCookies = (res: Response) => res.headers.getSetCookie().filter((l) => l.startsWith('lms_notice_'));

/** Signs a client (one browser's cookie jar) out and in as someone else, keeping its other cookies. */
export async function switchUser(c: Client, who: { username: string; password: string }): Promise<void> {
  await c.post('/signout', {});
  const res = await c.post('/signin', { username: who.username, password: who.password });
  if (res.status !== 302) throw new Error(`${who.username} signs in: ${res.status}`);
}
