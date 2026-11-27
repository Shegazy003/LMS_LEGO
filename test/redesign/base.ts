// LMS redesign wave R1a (product-contract v2 on PIL-322, rule register rows UX-3, UX-1 (look only), UX-34/UX-54/UX-62,
// UX-55, UX-62/UX-63 and UX-16a): the changes R1a makes to every page the earlier base comparisons crawl (waves 4 to 8
// and LMS-D9). R1a gives every page a new shell: a new shared style, the school colour as variables on <html>, a
// viewport that covers the safe area, the space header without its inline colour, and one navigation whose items carry
// an icon and their word in a <span> (with My subjects and To do added for a learner). The learner home and its preview
// are rebuilt (hero, due strip, cards; tested by test/redesign/home.test.ts and ux.test.ts), and dates on learner and
// guardian pages show in the S4 form inside <time datetime> (UX-16a, dates only).
//
// `r1aNormal` is applied to BOTH sides of a comparison (main's and the candidate's body), after each file's own
// normalising. On both sides, the closed list:
// - the <html> tag keeps only lang and dir; the viewport meta and the head <style> become one token each;
// - <body class="has-bar"> becomes <body>; the space header loses its inline style;
// - inside nav#top-nav: each item's icon and <span> wrapper are taken out, the My subjects and To do items (new in
//   R1a) are taken out, the Home item and aria-current are taken out (S9: a guardian-only member's nav is their
//   guardian home and My account, with the guardian home current; UX-96 tests the items and the current mark), and
//   the nav's bar class is taken out; the other items, their ids, addresses, words and order are still compared;
// - inside a page's own <style> blocks, main's fixed blues (#1a5fd0, #1f6feb, #0b3d91) and R1a's
//   var(--brand-strong) become one token (UX-94: no hard-coded blue);
// - the learner home (main holding #continue or #my-list on a learner page) becomes one token: its R1a content is
//   tested by the R1a tests, and the crawl follows main's own (raw) links, so no page drops out of the comparison;
// - a guardian's to-do line date (`bdi.due-date` holding a bare day on main's side) is written in the S4 form of the
//   page's language (src/format.ts, today's UTC date), as R1a shows it; the wrapper's dir is dropped on both sides;
// - an Arabic-Indic digit becomes its western digit (UX-104: R1a writes western digits in ui.ts);
// - the teacher's announcement help line (`annHelp`, AMBER 5: it no longer promises a home block) becomes a token;
// - a date: `<time datetime="D">…</time>` (D a day or an instant; R1a shows S4 words inside, main the bare day) and
//   a bare day in a text position (main's) both become [date D], so the day itself is still compared; a <bdi> holding only that date loses its wrapper (main's
//   is Latin left-to-right, R1a's isolates the S4 words in the page's direction, UX-16a).
// Everything else on every page stays byte-compared.

import { showDate } from '../../src/format.ts';
import type { Lang } from '../../src/labels.ts';

const STYLE =/(<head>[\s\S]*?)<style>[\s\S]*?<\/style>/;
const HTML_TAG = /<html lang="([^"]*)" dir="([^"]*)"[^>]*>/;
const VIEWPORT = /<meta name="viewport" content="[^"]*">/;
const NAV = /<nav id="top-nav" class="nav( tabbar)?"([^>]*)>([\s\S]*?)<\/nav>/g;
const NEW_ITEMS = /<a id="nav-(subjects|todo)"[^>]*>[\s\S]*?<\/a>/g;
const HOME_ITEM = /<a id="nav-home"[^>]*>[\s\S]*?<\/a>/;
const MAIN =/<main([^>]*)>([\s\S]*)<\/main>/;
const TIME = /<time datetime="(\d{4}-\d{2}-\d{2}[^"]*)">[^<]*<\/time>/g;
const BLUES = /#1a5fd0|#1f6feb|#0b3d91|var\(--brand-strong\)/gi;
const BARE_DATE =/>(\s*)(\d{4}-\d{2}-\d{2})(\s*)</g;

/** Whether the page is a learner home (or its preview): main's has a #continue section, R1a's main is class "home". */
function isLearnerHome(body: string): boolean {
  const m = MAIN.exec(body);
  if (!m) return false;
  return /<section id="continue"/.test(m[2]) || /\bclass="[^"]*\bhome\b/.test(m[1]) || /<ul id="my-list"/.test(m[2]);
}

/** `today`: the products' UTC day (YYYY-MM-DD) when their clock is pinned; the real one otherwise. */
export function r1aNormal(body: string, today = new Date().toISOString().slice(0, 10)): string {
  if (!body.startsWith('<!doctype html>')) return body;
  let out = body
    .replace(HTML_TAG, '<html lang="$1" dir="$2">')
    .replace(VIEWPORT, '[viewport]')
    .replace(STYLE, '$1<style>[style]</style>')
    .replace('<body class="has-bar">', '<body>')
    .replace(/<header class="space-header" role="none"[^>]*>/, '<header class="space-header" role="none">')
    .replace(NAV, (_all, _bar, attrs: string, items: string) =>
      `<nav id="top-nav" class="nav"${attrs}>${items.replace(NEW_ITEMS, '').replace(HOME_ITEM, '').replace(/ aria-current="page"/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<\/?span>/g, '')}</nav>`);
  if (isLearnerHome(out)) out = out.replace(MAIN, '<main>[R1a learner home]</main>');
  // Inside a page's own <style> blocks: main's fixed blues and R1a's school colour both become one token.
  out = out.replace(/<style>[\s\S]*?<\/style>/g, (s) => s.replace(BLUES, '[brand colour]'));
  // UX-16a: a guardian's to-do line shows its due day in the S4 form (wave 6 showed the bare day); main's day is
  // written in the S4 form of the page's language here, so the day is still compared, and the wrapper's direction
  // (main's Latin left-to-right, R1a's the page's) is dropped on both sides.
  const lang: Lang = /<html lang="ar"/.test(out) ? 'ar' : 'en';
  out = out.replace(/<bdi dir="(?:ltr|rtl)" class="due-date">(\d{4}-\d{2}-\d{2})<\/bdi>/g, (_m, d: string) => `<bdi class="due-date">${showDate(d, lang, today)}</bdi>`)
    .replace(/<bdi dir="(?:ltr|rtl)" class="due-date">([^<]*)<\/bdi>/g, '<bdi class="due-date">$1</bdi>');
  // UX-104 (AT-R1a.4d): main's Arabic-Indic digits in ui.ts words read as the western digits R1a writes.
  out = out.replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
  return out.replace(TIME, '[date $1]').replace(BARE_DATE, '>$1[date $2]$3<')
    // The isolating wrapper of a date: main's Latin <bdi dir="ltr" class="nowrap">, R1a's <bdi> in the page's direction.
    .replace(/<bdi[^>]*>(\[date [\dTZ:.-]+\])<\/bdi>/g, '$1')
    // AMBER 5 (R1a): the teacher's announcement help line now says the newest shows on the subject's card on the home.
    .replace(/<p class="ann-help">[^<]*<\/p>/g, '<p class="ann-help">[annHelp]</p>');
}

/** The same-site addresses a page links to (href and src), from the raw body: what a crawl follows. */
export function linksOf(body: string): string[] {
  return [...body.matchAll(/(?:href|src)="(\/[^"#]*)/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}
