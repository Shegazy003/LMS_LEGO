// Shared by the AT-13 privacy tests (contract product-contract-r2, AT-13 and
// section 3): every page a guardian (or the dual-role person) can reach, in
// Arabic and in English, found by following the links on the pages themselves
// from the person's home, plus the addresses a curious person could type.
import { Client } from '../support/http.ts';
import { A, B, G1, G2, as, linkThrough, type World } from '../at9/world.ts';
import { resultsWorld } from '../at10/marks.ts';
import { utcDatePlusDays } from '../support/http.ts';

export interface Reached {
  path: string;
  status: number;
  cacheControl: string | null;
  contentType: string;
  body: string;
}

export type PrivacyWorld = Awaited<ReturnType<typeof resultsWorld>>;

/** The world for AT-13: G1 linked to A and B, G2 to A, and B (a learner) also
 * the guardian of A; from R2-b, a published Mathematics exam (A 17, B Absent,
 * C 12, D 15.5) and an Arabic draft for A (test/at10/marks.ts). */
export async function privacyWorld(): Promise<PrivacyWorld> {
  const w = await resultsWorld({ links: true, extra: [{ username: B.username, role: 'guardian', valid_until: utcDatePlusDays(30) }] });
  const res = await linkThrough(w, w.ids[B.username], w.ids[A.username]);
  if (res.status !== 303) {
    await w.close();
    throw new Error(`B linked to A: ${res.status}`);
  }
  return w;
}

/** The results pages (R2-b) a curious person could type: My results, every result row (published and draft), and the marks pages. */
export function resultPaths(w: PrivacyWorld): string[] {
  return [
    `/s/${w.spaceId}/results`,
    ...[...Object.values(w.published), ...Object.values(w.draft)].map((r) => `/s/${w.spaceId}/results/${r.id}`),
    `/s/${w.spaceId}/publish/marks/${w.exam}`, `/s/${w.spaceId}/publish/marks/${w.draftExam}`,
  ];
}

export const VIEWERS = { G1, G2, B } as const;

/** Sets a person's own language (My account), so every page of theirs is in it. */
export async function useLanguage(c: Client, lang: 'ar' | 'en'): Promise<void> {
  const res = await c.post('/account/language', { lang });
  if (res.status !== 303) throw new Error(`language ${lang}: ${res.status}`);
}

/** Every page reachable by following same-site links from the person's home (sign-out aside), and the typed addresses. */
export async function crawl(c: Client, start: string[], typed: string[] = [], limit = 80): Promise<Reached[]> {
  const seen = new Set<string>();
  const queue = [...start, ...typed];
  const out: Reached[] = [];
  while (queue.length && out.length < limit) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await c.get(path);
    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.startsWith('text/') ? await res.text() : Buffer.from(await res.arrayBuffer()).toString('latin1');
    out.push({ path, status: res.status, cacheControl: res.headers.get('cache-control'), contentType, body });
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get('location');
      if (to?.startsWith('/')) queue.push(to);
      continue;
    }
    if (!contentType.startsWith('text/html')) continue;
    for (const m of body.matchAll(/(?:href|src)="(\/[^"#]*)/g)) {
      const next = m[1].replace(/&amp;/g, '&');
      if (!seen.has(next)) queue.push(next);
    }
  }
  return out;
}

/** The guardian pages of a world: homes and each linked learner's page, for every viewer. */
export function guardianPaths(w: World): string[] {
  return [`/s/${w.spaceId}`, `/s/${w.spaceId}/linked`, `/s/${w.spaceId}/linked/${w.ids[A.username]}`, `/s/${w.spaceId}/linked/${w.ids[B.username]}`];
}

/** The text a person reads on a page (tags, scripts and styles removed). */
export function visible(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export { A, B, G1, G2, as };
