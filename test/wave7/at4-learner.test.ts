// LMS wave 7, W7-2 (product-contract v2 on PIL-261, AT-4.1, AT-4.2 for the
// learner pages, AT-4.4): the key stays on the server, teacher text is safe on
// the learner's pages, and the preview is exact and stores nothing. Each
// labelled expectation is its own CI step (`W7 AT-4.n …`, job wave-7) and
// runs alone. AT-4.1c (random ids) is test/wave7/unit.test.ts (W7-1); AT-4.3's
// learner crawl is test/wave7/at4.test.ts; AT-4.4d is wave 3a's AT-3 journey
// with quizzes present (test/wave3a/at3.test.ts). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import type { InProcessWorker } from '../support/in-process.ts';
import { assertSameDocument, learnerHref, normaliseLearner, normalisePreview } from '../wave3a/world.ts';
import {
  ADMIN, HADEER, NOUR6, QA_QUESTIONS, QB_QUESTIONS, QX, QX_QUESTIONS, QX_TITLE, SALMA, W7A, as, closeWave6, quizSnapshot, subjectPath, textOf, wave7World, withW7c, words,
  type Wave1World,
} from './world.ts';
import { htmlOf, previewTakePath, resetQuizzes, resultOf, sectionOf, sending, takeOf, takePath } from './learner.ts';

const en = words('school', 'en');
const sql = (w: Wave1World) => (q: string) => w.p.sql(q);
const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const worker = (w: Wave1World) => (w.p as unknown as { worker: InProcessWorker }).worker;

/** The rows a page view may write (wave 3a, section 6.2): the person's own session refresh and the usage flush. */
const ALLOWED_WRITES = [
  /^UPDATE session SET expires_at = \? WHERE id = \? AND expires_at > 0$/,
  /^INSERT INTO usage_day \(day, requests, writes\) VALUES \(\?, \?, \?\)\s+ON CONFLICT \(day\) DO UPDATE SET requests = requests \+ excluded\.requests, writes = writes \+ excluded\.writes$/,
];
const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

/** A copy of the questions with every right answer moved to another answer of its question (the second world). */
const otherKey = (qs: typeof QA_QUESTIONS) => qs.map((q) => ({ ...q, rightId: q.answers[(q.answers.findIndex((a) => a.id === q.rightId) + 1) % q.answers.length].id }));

/** Everything outside visible text nodes (AT-4.1b): tags with their attribute names and values, comments, script content; the shared <style> content excluded. */
function markupOf(doc: string): string {
  const d = doc.replace(/<style>[\s\S]*?<\/style>/g, '<style></style>');
  const scripts = [...d.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const comments = [...d.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]);
  const tags = [...d.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<[^>]*>/g)].map((m) => m[0]);
  return [...tags, ...comments, ...scripts].join('\n');
}

describe('W7 AT-4.1 no key before sending (W7-a)', { concurrency: false }, () => {
  let w: Wave1World;
  const c: Record<string, Client> = {};
  before(async () => {
    ({ w } = await wave7World());
    for (const [name, p] of [['salma', SALMA], ['nour', NOUR6], ['amal', ADMIN], ['hadeer', HADEER]] as const) c[name] = await as(w, p, 'en');
  });
  after(() => closeWave6(w));

  /** Every response a learner can reach before sending (and the previews), in a fixed order. */
  async function beforeSending(): Promise<{ what: string; status: number; body: string }[]> {
    const s = w.school;
    const out: { what: string; status: number; body: string }[] = [];
    const get = async (who: string, path: string) => {
      const res = await c[who].get(path);
      out.push({ what: `${who} GET ${path}`, status: res.status, body: await res.text() });
    };
    const post = async (who: string, path: string, fields: Record<string, string>) => {
      const res = await c[who].post(path, fields);
      out.push({ what: `${who} POST ${path} ${JSON.stringify(fields)}`, status: res.status, body: await res.text() });
    };
    for (const lang of ['ar', 'en'] as const) {
      for (const who of ['salma', 'nour', 'amal', 'hadeer']) await c[who].post('/account/language', { lang });
      await get('salma', subjectPath(s, s.math));
      await get('nour', subjectPath(s, s.math));
      await get('salma', takePath(s, W7A.QA));
      await post('salma', takePath(s, W7A.QA), sending(0, { 'qa-one': 'qa-two-a' }));
      await post('salma', takePath(s, W7A.QA), sending(7, { 'qa-one': 'qa-one-b' }));
      assert.equal((await c.hadeer.post(`/s/${s.id}/publish/edit/${s.math}/quizzes/${W7A.QA}/close`, { rev: '0' })).status, 303);
      await post('salma', takePath(s, W7A.QA), sending(0, { 'qa-one': 'qa-one-b', 'qa-two': 'qa-two-c' }));
      assert.equal((await c.hadeer.post(`/s/${s.id}/publish/edit/${s.math}/quizzes/${W7A.QA}/reopen`, { rev: '0' })).status, 303);
      for (const who of ['amal', 'hadeer']) {
        await get(who, `/s/${s.id}/preview/learn/${s.math}`);
        await get(who, previewTakePath(s, W7A.QA));
        await get(who, previewTakePath(s, W7A.QB));
        await post(who, previewTakePath(s, W7A.QA), sending(0, { 'qa-one': 'nobody' }));
        await post(who, previewTakePath(s, W7A.QA), sending(3, { 'qa-one': 'qa-one-a' }));
      }
    }
    await c.salma.post('/account/language', { lang: 'en' });
    return out;
  }

  it('W7 AT-4.1a two worlds: with the same ids and only the right answers moved, every page a learner reaches before sending (and the previews, the 400 and 409 redraws) is byte-identical', async (t) => {
    await resetQuizzes(w);
    const first = await beforeSending();
    for (const [id, qs] of [[W7A.QA, QA_QUESTIONS], [W7A.QB, QB_QUESTIONS]] as const) {
      await w.p.sql(`UPDATE quiz SET questions_json = '${JSON.stringify(otherKey(qs)).replace(/'/g, "''")}' WHERE id = '${id}'`);
    }
    const second = await beforeSending();
    assert.equal(second.length, first.length);
    const statuses: Record<number, number> = {};
    for (const [i, a] of first.entries()) {
      statuses[a.status] = (statuses[a.status] ?? 0) + 1;
      assert.equal(second[i].what, a.what);
      assert.equal(second[i].status, a.status, `${a.what}: the same status`);
      assert.ok(second[i].body === a.body, `${a.what}: byte-identical in the two worlds`);
    }
    t.diagnostic(`AT-4.1a ${first.length} responses compared in each world, by status ${JSON.stringify(statuses)}`);
    for (const s of [200, 400, 409]) assert.ok((statuses[s] ?? 0) > 0, `responses with status ${s} were compared`);
    const right = (await w.p.sql(`SELECT questions_json FROM quiz WHERE id = '${W7A.QA}'`))[0].questions_json as string;
    assert.notEqual(JSON.parse(right)[0].rightId, QA_QUESTIONS[0].rightId, 'the second world has other right answers');
  });

  it('W7 AT-4.1b markup scan: outside visible text (tags, attribute names and values, comments, script content), none of rightId, correct, right, answer_key appears, the shared style excluded', async () => {
    // Self-check: the scan sees a planted marker in an attribute and in a comment, and not in visible text.
    assert.ok(/right/i.test(markupOf('<li class="quiz-is-right">x</li>')) && /correct/i.test(markupOf('<!-- correct -->')) && !/right/i.test(markupOf('<p>right</p>')), 'the scan finds planted markers');
    await resetQuizzes(w);
    const pages = await beforeSending();
    for (const p of pages) {
      const hit = /rightId|correct|right|answer_key/i.exec(markupOf(p.body));
      assert.equal(hit?.[0] ?? null, null, `${p.what}: no ${hit?.[0]} in the markup (${hit ? JSON.stringify(markupOf(p.body).slice(Math.max(0, hit.index - 80), hit.index + 40)) : ''})`);
    }
  });

  it('W7 AT-4.1d scoring on the server: the take form posts only the chosen answer ids; no learner page holds a script element', async () => {
    await resetQuizzes(w);
    const s = w.school;
    const pages = await beforeSending();
    for (const p of pages) assert.ok(!/<script\b/i.test(p.body), `${p.what}: no script element`);
    const take = takeOf(await htmlOf(c.salma, takePath(s, W7A.QA)))!;
    assert.deepEqual(new Set(take.questions.flatMap((q) => q.choices.map((x) => x.name))), new Set(QA_QUESTIONS.map((q) => `q-${q.id}`)), 'the fields are the question ids, the values the answer ids');
    // The sending and the result page have no script either: the server scored it.
    assert.equal((await c.salma.post(takePath(s, W7A.QA), sending(0, { 'qa-one': 'qa-one-b' }))).status, 303);
    for (const path of [takePath(s, W7A.QA).concat('/result'), subjectPath(s, s.math)]) assert.ok(!/<script\b/i.test(await htmlOf(c.salma, path)), `${path}: no script element`);
  });
});

describe('W7 AT-4.2 safe text on the learner pages (W7-c: QX open)', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    ({ w } = await wave7World());
    await withW7c(w);
    await w.p.sql(`UPDATE quiz SET state = 'open' WHERE id = '${QX}'`);
  });
  after(() => closeWave6(w));

  it('W7 AT-4.2 (learner pages) the subject page, take page, result page and previews show every text literally; no element, attribute or link from it; markdown not rendered; line breaks by CSS pre-line; titles in <bdi>, texts in dir="auto"', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const hadeer = await as(w, HADEER, 'en');
    const pages: [string, string][] = [];
    pages.push(['subject page', await htmlOf(salma, subjectPath(s, s.math))]);
    pages.push(['take page', await htmlOf(salma, takePath(s, QX))]);
    pages.push(['preview subject page', await htmlOf(hadeer, `/s/${s.id}/preview/learn/${s.math}`)]);
    pages.push(['preview take page', await htmlOf(hadeer, previewTakePath(s, QX))]);
    const picks = { 'qx-one': 'qx-one-a', 'qx-two': 'qx-two-a' };
    const preview = await hadeer.post(previewTakePath(s, QX), sending(0, picks));
    assert.equal(preview.status, 200);
    pages.push(['preview result', await preview.text()]);
    assert.equal((await salma.post(takePath(s, QX), sending(0, picks))).status, 303);
    pages.push(['result page', await htmlOf(salma, `${takePath(s, QX)}/result`)]);
    pages.push(['subject page (taken)', await htmlOf(salma, subjectPath(s, s.math))]);
    for (const [what, body] of pages) {
      const main = body.slice(body.indexOf('<main'));
      assert.ok(!/<script\b/i.test(body), `${what}: no script element`);
      assert.ok(!/<img\b/i.test(main), `${what}: no img`);
      assert.ok(!/href="javascript:/i.test(main), `${what}: no javascript: address`);
      assert.ok(!/onerror=/i.test(main.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, '')), `${what}: no event attribute`);
      assert.ok(!/<(b|strong|em)>/i.test(main), `${what}: no markup from the text`);
      assert.ok(!/<br\b/i.test(main), `${what}: no <br> built from the text`);
      assert.ok(main.includes(`<bdi>${escaped(QX_TITLE)}</bdi>`), `${what}: the title, escaped, in <bdi>`);
    }
    for (const [what, body] of pages.filter(([p]) => !p.includes('subject page'))) {
      for (const q of QX_QUESTIONS) {
        assert.ok(body.includes(`<span class="quiz-text" dir="auto">${escaped(q.text)}</span>`) || body.includes(`<p class="quiz-text" dir="auto">${escaped(q.text)}</p>`), `${what}: question text, escaped, in a dir="auto" element, its line break as is`);
        for (const a of q.answers) assert.ok(body.includes(`<span class="quiz-answer-text" dir="auto">${escaped(a.text)}</span>`), `${what}: answer ${JSON.stringify(a.text)} escaped in a dir="auto" element`);
      }
      assert.ok(body.includes('**bold**') && body.includes('&amp;lt;b&amp;gt;'), `${what}: markdown and entities shown literally`);
    }
    assert.ok(/\.quiz-text\{white-space:pre-line/.test(pages[1][1]), 'the line break shows through CSS pre-line');
  });
});

describe('W7 AT-4.4 preview: the section and the take page as Nour Test sees them; a preview sending is scored and stores nothing', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    ({ w } = await wave7World());
  });
  after(() => closeWave6(w));

  const norm = { learnerWord: '', noNotice: true };
  /** The preview's own addresses (links and the form's action) back to the learner's. */
  const actions = (doc: string) => doc.replace(/\baction="([^"]*)"/g, (_, a: string) => `action="${learnerHref(a.replace(/&amp;/g, '&')).replace(/&/g, '&amp;')}"`);

  it('W7 AT-4.4 (a and b) the preview subject page\'s quiz section and the preview take page, a draft\'s too, are Nour Test\'s, byte-identical after normalising the preview addresses', async () => {
    await resetQuizzes(w);
    const s = w.school;
    const nour = await as(w, NOUR6, 'en');
    for (const lang of ['ar', 'en'] as const) {
      await nour.post('/account/language', { lang });
      const n = { ...norm, lang, learnerWord: words('school', lang)('learner') };
      const learnerSection = sectionOf(await htmlOf(nour, subjectPath(s, s.math)))!.html;
      const learnerTake = normaliseLearner(await htmlOf(nour, takePath(s, W7A.QA)), n);
      // Nour Test's page of QB while it is open, for the draft's preview.
      await w.p.sql(`UPDATE quiz SET state = 'open' WHERE id = '${W7A.QB}'`);
      const learnerDraft = normaliseLearner(await htmlOf(nour, takePath(s, W7A.QB)), n);
      await w.p.sql(`UPDATE quiz SET state = 'draft' WHERE id = '${W7A.QB}'`);
      for (const who of [ADMIN, HADEER]) {
        const c = await as(w, who, lang);
        for (const from of ['', `?from=${who === ADMIN ? 'topic' : 'subject'}:${s.math}`]) {
          const page = await htmlOf(c, `/s/${s.id}/preview/learn/${s.math}${from}`);
          const section = sectionOf(normalisePreview(page, n))!;
          assert.equal(section.html, learnerSection, `${who.username} ${lang} ${from}: the preview section is Nour Test's`);
          assertSameDocument(actions(normalisePreview(await htmlOf(c, `${previewTakePath(s, W7A.QA)}${from}`), n)), learnerTake, `${who.username} ${lang} ${from}: the preview take page of QA`);
          assertSameDocument(actions(normalisePreview(await htmlOf(c, `${previewTakePath(s, W7A.QB)}${from}`), n)), learnerDraft, `${who.username} ${lang} ${from}: the preview take page of the draft QB`);
        }
      }
      // The editor's preview link reaches the draft's preview take page.
      const h = await as(w, HADEER, lang);
      const editor = await htmlOf(h, `/s/${s.id}/publish/edit/${s.math}/quizzes/${W7A.QB}`);
      const link = /<a id="quiz-preview-link" class="quiz-link-button" href="([^"]+)">([\s\S]*?)<\/a>/.exec(editor);
      assert.ok(link, 'the editor shows quizPreviewLink');
      assert.equal(textOf(link[2]), words('school', lang)('quizPreviewLink', { learner: words('school', lang)('learner').toLocaleLowerCase(lang) }));
      assert.equal(link[1].replace(/&amp;/g, '&'), `${previewTakePath(s, W7A.QB)}?from=subject:${s.math}`);
      assert.equal((await h.get(link[1].replace(/&amp;/g, '&'))).status, 200, 'the link opens the preview take page');
    }
  });

  it('W7 AT-4.4 (c) a preview POST is scored on the server and answers 200 with the result page and quizPreviewNotSaved; under the statement spy no preview request writes anything', async (t) => {
    await resetQuizzes(w);
    const s = w.school;
    const hadeer = await as(w, HADEER, 'en');
    const before = await quizSnapshot(sql(w));
    const log: string[] = [];
    worker(w).setHooks({ seen: (q) => void log.push(q) });
    const paths: [string, string, Record<string, string> | null][] = [
      ['GET', `/s/${s.id}/preview/learn/${s.math}`, null], ['GET', previewTakePath(s, W7A.QA), null], ['GET', previewTakePath(s, W7A.QB), null],
      ['POST', previewTakePath(s, W7A.QA), sending(0, { 'qa-one': 'qa-one-b', 'qa-two': 'qa-two-a' })],
      ['POST', previewTakePath(s, W7A.QB), sending(0, { 'qb-one': 'qb-one-a', 'qb-two': 'qb-two-a' })],
      ['POST', previewTakePath(s, W7A.QA), sending(0, { 'qa-one': 'qa-two-a' })],
      ['POST', previewTakePath(s, W7A.QA), sending(5, { 'qa-one': 'qa-one-b' })],
    ];
    const answers: { what: string; status: number; body: string }[] = [];
    for (const [method, path, fields] of paths) {
      const res = method === 'GET' ? await hadeer.get(path) : await hadeer.post(path, fields!);
      answers.push({ what: `${method} ${path}`, status: res.status, body: await res.text() });
    }
    await worker(w).settle();
    worker(w).setHooks({});
    const writes = log.filter((q) => WRITE.test(q)).map((q) => q.replace(/\s+/g, ' ').trim());
    const other = writes.filter((q) => !ALLOWED_WRITES.some((re) => re.test(q)));
    t.diagnostic(`AT-4.4c ${answers.length} preview requests, ${log.length} statements, ${writes.length} writes (the session refresh and usage flush only)`);
    assert.deepEqual(other, [], 'no preview request writes anything (but the session refresh and usage flush every page view makes)');
    assert.equal(await quizSnapshot(sql(w)), before, 'no quiz or attempt row changed');
    assert.deepEqual(answers.map((a) => a.status), [200, 200, 200, 200, 200, 400, 409]);
    const qa = resultOf(answers[3].body);
    assert.equal(qa.status, en('quizPreviewNotSaved'), 'quizPreviewNotSaved');
    assert.equal(qa.score, en('quizScoreLine', { score: '1', total: '3' }), 'scored on the server: 1 of 3');
    assert.deepEqual(qa.sections.map((x) => x.verdict), [en('quizRight'), en('quizWrong'), en('quizNoAnswer')], 'drawn by quizResultBody');
    assert.ok(answers[3].body.includes('id="preview-banner"'), 'the wave 3a banner stays');
    assert.equal(resultOf(answers[4].body).score, en('quizScoreLine', { score: '2', total: '2' }), 'a draft is scored too');
    assert.equal(takeOf(answers[5].body)?.message, en('quizAnswerInvalid'));
    assert.equal(takeOf(answers[6].body)?.message, en('quizChanged'));
  });
});
