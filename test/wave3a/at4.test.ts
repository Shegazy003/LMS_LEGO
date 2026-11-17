// W3a AT-4 (product-contract v2 on PIL-216, sections 8.3 and 9): clearly a
// preview, and the way back. Request level, in Arabic and English; the
// browser-level checks (390 px, keyboard, script off) are the UX-18 to UX-22
// steps. Each labelled expectation is its own CI step
// (--test-name-pattern "W3a AT-4.<n>").
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import { OWNER } from '../support/seed.ts';
import {
  ADMIN, COMPANY_ADMIN, HADEER, MATH_ORDER, as, element, home, ownerPreview, previewHome, previewLesson, previewSubject, textOfHtml, wave3aWorld, word,
  type From, type Wave3aWorld,
} from './world.ts';

const LANGS = ['ar', 'en'] as const;
const hrefs = (doc: string) => [...doc.matchAll(/\bhref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const hrefOf = (doc: string, id: string) => /\bhref="([^"]*)"/.exec(element(doc, new RegExp(`<a\\b[^>]*\\bid="${id}"[^>]*>`))?.html ?? '')?.[1]?.replace(/&amp;/g, '&');
/** Visible text as a browser reads it: inline tags (the kit words' <bdi>) add no space. */
const inline = (fragment: string) => fragment.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function ok(c: Client, path: string, what: string): Promise<string> {
  const res = await c.get(path);
  assert.equal(res.status, 200, `${what}: ${path} answers 200`);
  return res.text();
}

/** AT-4.1: the banner first in the body, the bottom line last, each in the page's language. */
function framed(doc: string, lang: 'ar' | 'en', path: string): void {
  const body = doc.slice(doc.indexOf('<body'));
  const first = /^<body[^>]*>\s*(<[^>]+>)/.exec(body)?.[1] ?? '';
  assert.ok(/\bid="preview-banner"/.test(first), `${path}: the banner is the first element of the body (found ${first})`);
  const banner = element(doc, /<section\b[^>]*\bid="preview-banner"[^>]*>/)!;
  assert.ok(banner.html.includes(`lang="${lang}"`) && banner.html.includes(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`), `${path}: banner lang and dir`);
  const text = inline(banner.html);
  for (const key of ['previewTag', 'previewInert', 'previewBack'] as const) assert.ok(text.includes(word(lang, key)), `${path}: banner has ${key}`);
  assert.ok(text.includes(word(lang, 'previewBanner', { learner: word(lang, 'learner') })), `${path}: the banner sentence`);
  assert.ok(/id="preview-scope"/.test(banner.html), `${path}: the scope line`);
  const end = element(doc, /<div\b[^>]*\bid="preview-end"[^>]*>/);
  assert.ok(end, `${path}: the bottom line`);
  assert.ok(inline(end.html).includes(word(lang, 'previewEnd')) && /id="preview-back-end"/.test(end.html), `${path}: "End of the preview page." with Back`);
  const after = doc.slice(end.end).replace(/<script[\s\S]*?<\/script>/g, '');
  assert.ok(!/<(a|button|p|section|div|main|nav)\b/.test(after), `${path}: nothing after the bottom line`);
}

describe('W3a AT-4 clearly a preview, and the way back', { concurrency: false }, () => {
  let w: Wave3aWorld;
  before(async () => {
    w = await wave3aWorld();
  });
  after(async () => {
    await w?.close();
  });

  /** Every preview page reachable from a preview home, by its links (the AT-4.2 crawl). */
  async function crawl(c: Client, start: string, lang: 'ar' | 'en', visit: (path: string, doc: string) => void): Promise<number> {
    const from = new URL(start, 'http://x').searchParams.get('from');
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const path = queue.shift()!;
      if (seen.has(path)) continue;
      seen.add(path);
      const doc = await ok(c, path, `crawl ${lang}`);
      visit(path, doc);
      for (const href of hrefs(doc)) {
        if (/^https?:\/\//.test(href)) continue; // an outside link, as for the learner
        if (href.startsWith(`/s/${w.school.id}/file/`)) continue; // a material
        if (href.startsWith(`/s/${w.school.id}/preview`)) {
          assert.equal(new URL(href, 'http://x').searchParams.get('from'), from, `${path}: ${href} carries the same from`);
          queue.push(href.split('#')[0]);
          continue;
        }
        // Only the two Back links lead outside the preview.
        const back = hrefOf(doc, 'preview-back');
        assert.ok(href === back, `${path}: ${href} is a preview address, a material, or Back`);
      }
    }
    return seen.size;
  }

  it('W3a AT-4.1 every preview page starts with the banner and ends with the bottom line, in its language', async (t) => {
    let pages = 0;
    for (const lang of LANGS) {
      for (const who of [ADMIN, HADEER]) {
        const c = await as(w, who, lang);
        pages += await crawl(c, previewHome(w.school, 'home'), lang, (path, doc) => framed(doc, lang, path));
      }
      const owner = await as(w, OWNER, lang);
      for (const path of [ownerPreview(w.school), `${ownerPreview(w.school)}/results`]) framed(await ok(owner, path, 'owner'), lang, path);
      // An unpublished subject (Hadeer's Physics) and a lesson reached only from the editor.
      const hadeer = await as(w, HADEER, lang);
      framed(await ok(hadeer, previewSubject(w.school, w.school.physics, undefined, `subject:${w.school.physics}`), 'Physics'), lang, 'Physics');
    }
    t.diagnostic(`AT-4.1 preview pages checked: ${pages}`);
  });

  it('W3a AT-4.2 every link of every preview page is a preview address with the same from, a material, or Back', async () => {
    for (const lang of LANGS) {
      for (const [who, from] of [[ADMIN, `topic:${w.school.math}`], [HADEER, 'home']] as const) {
        const c = await as(w, who, lang);
        const n = await crawl(c, previewHome(w.school, from as From), lang, () => undefined);
        assert.ok(n >= 1 + 1 + 4 + MATH_ORDER.length, `${who.username}: the crawl reached the home, My results, the outlines and the lessons (${n})`);
      }
    }
  });

  it('W3a AT-4.3 Back leads to the page of origin after any number of pages; an invalid from leads to the space home', async () => {
    for (const lang of LANGS) {
      const amal = await as(w, ADMIN, lang);
      const hadeer = await as(w, HADEER, lang);
      const owner = await as(w, OWNER, lang);
      const editorLesson = w.school.lessons['Adding fractions'];
      const entries: [Client, string, string][] = [
        [amal, home(w.school), 'view-as'],
        [amal, `/s/${w.school.id}/admin/topics/${w.school.math}`, 'view-as'],
        [hadeer, home(w.school), 'view-as'],
        [hadeer, `/s/${w.school.id}/publish/edit/${w.school.math}`, 'preview-subject'],
        [hadeer, `/s/${w.school.id}/publish/compose/${editorLesson}`, 'preview'],
        [owner, `/owner/spaces/${w.school.id}`, 'view-as'],
      ];
      for (const [c, origin, id] of entries) {
        const entry = hrefOf(await ok(c, origin, 'entry page'), id);
        assert.ok(entry, `${origin}: the entry link #${id}`);
        let path = entry;
        // Three more pages inside the preview, by its own links where it has them.
        for (let step = 0; step < 4; step++) {
          const doc = await ok(c, path, `${origin} step ${step}`);
          assert.equal(hrefOf(doc, 'preview-back'), origin, `${origin} step ${step}: top Back`);
          assert.equal(hrefOf(doc, 'preview-back-end'), origin, `${origin} step ${step}: bottom Back`);
          const next = hrefs(doc).find((h) => h.includes('/preview') && h.split('#')[0] !== path && !h.endsWith('/logo'));
          if (!next) break;
          path = next.split('#')[0];
        }
      }
      // A from that is not valid now: the person's space home, with no error.
      const company = w.company.math;
      const arabic = w.school.arabic;
      for (const from of ['nowhere', `topic:${company}`, `subject:${arabic}`, `lesson:${w.school.arabicLessons['The noun']}`, 'topic:../../x', `subject:${company}`]) {
        const doc = await ok(hadeer, `${previewHome(w.school)}?from=${encodeURIComponent(from)}`, `from=${from}`);
        assert.equal(hrefOf(doc, 'preview-back'), home(w.school), `from=${from}: Back leads to the space home`);
        // A value of the wrong shape is dropped, so no link carries it.
        if (!/^(home|(topic|subject|lesson):[A-Za-z0-9-]+)$/.test(from)) assert.ok(!hrefs(doc).some((h) => h.includes('from=')), `from=${from} is not carried`);
      }
      const amalTopic = await ok(amal, `${previewHome(w.school)}?from=${encodeURIComponent(`topic:${company}`)}`, 'Amal, another space');
      assert.equal(hrefOf(amalTopic, 'preview-back'), home(w.school), 'another space\'s subject: the space home');
    }
  });

  it('W3a AT-4.4 the entry points name the kit\'s learner word; the editors\' links keep their text and open the preview', async () => {
    for (const lang of LANGS) {
      const amal = await as(w, ADMIN, lang);
      const hadeer = await as(w, HADEER, lang);
      const owner = await as(w, OWNER, lang);
      const basem = await as(w, COMPANY_ADMIN, lang);
      const viewAs = (kit: 'school' | 'company') => word(lang, 'viewAsLearner', { learner: word(lang, 'learner', {}, kit) }, kit);
      const school = viewAs('school');
      const checks: [Client, string, string, string][] = [
        [amal, home(w.school), school, previewHome(w.school, 'home')],
        [amal, `/s/${w.school.id}/admin/topics/${w.school.math}`, school, previewSubject(w.school, w.school.math, undefined, `topic:${w.school.math}`)],
        [hadeer, home(w.school), school, previewHome(w.school, 'home')],
        [owner, `/owner/spaces/${w.school.id}`, school, ownerPreview(w.school)],
        [basem, home(w.company), viewAs('company'), previewHome(w.company, 'home')],
      ];
      for (const [c, path, text, href] of checks) {
        const doc = await ok(c, path, 'entry page');
        const link = element(doc, /<a\b[^>]*\bid="view-as"[^>]*>/);
        assert.ok(link, `${path}: "View as" link`);
        assert.equal(inline(link.html), text, `${path}: its text`);
        assert.equal(hrefOf(doc, 'view-as'), href, `${path}: opens the preview`);
        assert.ok(!/target=/.test(link.html), `${path}: same tab`);
      }
      if (lang === 'en') assert.equal(school, 'View as Student');
      if (lang === 'en') assert.equal(viewAs('company'), 'View as Employee');
      const editor = await ok(hadeer, `/s/${w.school.id}/publish/edit/${w.school.math}`, 'subject editor');
      assert.equal(textOfHtml(element(editor, /<a\b[^>]*\bid="preview-subject"[^>]*>/)!.html), word(lang, 'preview'), 'subject editor link text');
      assert.equal(hrefOf(editor, 'preview-subject'), previewSubject(w.school, w.school.math, undefined, `subject:${w.school.math}`));
      const lessonId = w.school.lessons['Adding fractions'];
      const composer = await ok(hadeer, `/s/${w.school.id}/publish/compose/${lessonId}`, 'lesson editor');
      assert.equal(textOfHtml(element(composer, /<a\b[^>]*\bid="preview"[^>]*>/)!.html), word(lang, 'preview'), 'lesson editor link text');
      assert.equal(hrefOf(composer, 'preview'), previewLesson(w.school, lessonId, `lesson:${lessonId}`));
    }
  });
});
