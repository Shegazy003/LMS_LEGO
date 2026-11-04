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

/** The results pages a curious person could type: My results, every result row (published and draft), and the marks pages
 * (R2-b); from R2-c, the publisher's history and correction pages and the admin's results pages. */
export function resultPaths(w: PrivacyWorld): string[] {
  return [
    `/s/${w.spaceId}/results`,
    ...[...Object.values(w.published), ...Object.values(w.draft)].map((r) => `/s/${w.spaceId}/results/${r.id}`),
    `/s/${w.spaceId}/publish/marks/${w.exam}`, `/s/${w.spaceId}/publish/marks/${w.draftExam}`,
    `/s/${w.spaceId}/publish/marks/${w.exam}/history`, `/s/${w.spaceId}/publish/marks/${w.exam}/correct?learner=${w.ids[A.username]}`,
    `/s/${w.spaceId}/admin/results`, `/s/${w.spaceId}/admin/results/${w.exam}`, `/s/${w.spaceId}/admin/results/${w.draftExam}`,
  ];
}

/** R2-c: the results section of a guardian's learner page. Its digits are
 * allowed only in these forms: each result's exam date (YYYY-MM-DD), its
 * score ("mark / maximum", or none for Absent) and its "Corrected on <date>"
 * line. Returns the page with the section taken out, and every piece of the
 * section, outside those forms, that holds a digit (none expected). */
export function resultsSection(html: string): { rest: string; strays: string[] } {
  const strays: string[] = [];
  const rest = html.replace(/<section id="results"[^>]*>([\s\S]*?)<\/section>/g, (_, section: string) => {
    const left = section
      .replace(/<span class="muted date" dir="ltr">\d{4}-\d{2}-\d{2}<\/span>/g, ' ')
      .replace(/<span class="score" dir="auto">(\d{1,4}(\.\d)? \/ \d{1,4}(\.\d)?|[^<\d]*)<\/span>/g, ' ')
      .replace(/<span class="corrected">[^<\d]*\d{4}-\d{2}-\d{2}[^<\d]*<\/span>/g, ' ')
      .replace(/<[^>]+>/g, ' ');
    for (const m of left.matchAll(/[^\s]*[0-9٠-٩][^\s]*/g)) strays.push(m[0]);
    return ' ';
  });
  return { rest, strays };
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

// ----------------------------------------------- lesson-activity scan ----
// Section 3: the scan uses the exact phrases of the feature's dictionary keys,
// in both languages, not word stems, so ordinary words such as "Open" are never
// hit. From R2-d the phrases of the feature's own keys are added (R2D_KEYS),
// and those keys are the exempt list.

/** The dictionary keys added by R2-d (lesson activity). Each is shown only on an exempt page or piece. */
export const R2D_KEYS = [
  'activityStatusOn', 'activityStatusOff', 'activityWhatTitle', 'activityWhat', 'activityWhoTitle', 'activityWho', 'activityKeptTitle',
  'activityKept', 'activityStartNote', 'activityNoticeTitle', 'activityTold', 'activityToldNote', 'activitySwitchOn', 'activityToldMissing',
  'activityOffNote', 'activitySwitchOff', 'activityOffConfirmTitle', 'activityOffYes', 'activityOnDone', 'activityOffDone', 'activityNotice',
  'activityOff', 'lastOpenedOn', 'noOpenRecorded', 'recordingSince', 'activityExplain', 'activityWhose',
] as const;

export const ACTIVITY_PHRASES = {
  en: [
    'Last opened on', 'No open recorded', 'Recording since', 'Lesson activity', 'which lessons you opened', 'Not opened', 'last opened', 'times opened',
    'is not switched on in', 'you last opened them',
  ],
  ar: [
    'نشاط الدروس', 'آخر فتح', 'تاريخ آخر فتح', 'لم يُسجَّل فتح', 'لم يسجل فتح', 'التسجيل منذ', 'الدروس التي فتحتها', 'لم يُفتح', 'لم يفتح',
    'لا يوجد فتح مسجّل', 'أي الدروس فتحتها',
  ],
};

/** Dictionary keys allowed to carry a phrase: the exempt places of section 3 (R2-d's own keys). */
export const EXEMPT_KEYS: string[] = [...R2D_KEYS];

const MONTHS = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b|(يناير|فبراير|مارس|أبريل|إبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)/i;

/** Every lesson-activity phrase, open date, count or time found in a text. */
export function activityIn(text: string): string[] {
  const hits: string[] = [];
  for (const p of ACTIVITY_PHRASES.en) if (text.toLowerCase().includes(p.toLowerCase())) hits.push(p);
  for (const p of ACTIVITY_PHRASES.ar) if (text.includes(p)) hits.push(p);
  if (/\d{4}-\d{2}-\d{2}/.test(text)) hits.push('a date');
  if (MONTHS.test(text)) hits.push('a month name');
  if (/\b\d{1,2}:\d{2}\b/.test(text)) hits.push('a time of day');
  if (/[0-9٠-٩]/.test(text)) hits.push('a number (a count, a date or a time)');
  return hits;
}

/** The exempt pages (section 3, places 1 and 2): the guardian's lesson-activity page and the admin's switch page with its step. */
export const isExemptPage = (path: string) => /^\/s\/[^/]+\/linked\/[^/]+\/activity(\?|$)/.test(path) || /^\/s\/[^/]+\/admin\/activity(\/off)?(\?|$)/.test(path);

/** A page with its exempt pieces taken out: the learner's notice, the "not
 * switched on" line and the links to the exempt pages, each marked
 * data-activity (src/views/activity.ts). Each is one element holding no
 * element of its own name. */
export function exemptRemoved(html: string): string {
  return html.replace(/<(p|a)\b[^>]*\bdata-activity\b[^>]*>[\s\S]*?<\/\1>/g, ' ');
}
