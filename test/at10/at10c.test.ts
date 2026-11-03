// AT-10c (contract product-contract-r2, R2-b): accepted mark forms are Latin
// or Arabic-Indic digits, with ".", "," or "٫" as the decimal mark, at most
// one decimal, surrounding spaces ignored (17, 17.5, 17,5, ١٧٫٥, " 17 "); all
// are stored as the same number. Refused, with an error text beside the row:
// an empty box without Absent, a mark above the maximum or below 0, two
// decimals, letters, 1,7,5, a mark box filled and Absent ticked together.
// Nothing is published by a refused attempt.
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, phone, shot, signIn, submit } from '../support/browser.ts';
import { readRow } from '../../src/exams.ts';
import { A, B, C, D, HADEER, MATH_ORDER, as, count, createExam, marksForm, marksPath, marksWorld, shownRows, storedRows, type Row, type World } from './marks.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-10/', import.meta.url));
const ACCEPTED: [string, number][] = [['17', 17], ['17.5', 17.5], ['17,5', 17.5], ['١٧٫٥', 17.5], [' 17 ', 17], ['۱۷٫۵', 17.5], ['0', 0], ['20', 20], ['١٧', 17], ['17٫5', 17.5]];
const REFUSED: [string, Row, string][] = [
  ['an empty box without Absent', {}, 'Enter a mark or tick Absent.'],
  ['a mark above the maximum', { mark: '21' }, 'The mark must be from 0 to 20.'],
  ['a mark below 0', { mark: '-1' }, 'The mark must be from 0 to 20.'],
  ['two decimals', { mark: '17.25' }, 'Type a number such as 17 or 17.5 (one decimal at most).'],
  ['letters', { mark: 'abc' }, 'Type a number such as 17 or 17.5 (one decimal at most).'],
  ['1,7,5', { mark: '1,7,5' }, 'Type a number such as 17 or 17.5 (one decimal at most).'],
  ['a mark and Absent together', { mark: '17', absent: true }, 'Type a mark or tick Absent, not both.'],
];

test('AT-10c the reading of one row: each accepted form is the same number; each refused form names its error', () => {
  for (const [typed, value] of ACCEPTED) assert.deepEqual(readRow(typed, false, 20), { kind: 'marked', mark: value }, JSON.stringify(typed));
  assert.deepEqual(readRow('', true, 20), { kind: 'absent' });
  assert.deepEqual(readRow('  ', false, 20), { kind: 'empty' }, 'an empty box is allowed in a draft; Publish refuses it');
  for (const [typed, error] of [['21', 'markOutOfRange'], ['-1', 'markOutOfRange'], ['17.25', 'markInvalid'], ['abc', 'markInvalid'], ['1,7,5', 'markInvalid'], ['17a', 'markInvalid'], ['1 7', 'markInvalid'], ['.5', 'markInvalid'], ['17.', 'markInvalid']] as const) {
    assert.deepEqual(readRow(typed, false, 20), { kind: 'refused', error }, JSON.stringify(typed));
  }
  assert.deepEqual(readRow('17', true, 20), { kind: 'refused', error: 'markAndAbsent' });
});

let w: World & { science: string };
let browser: Browser;
let exam = '';
const everyone = MATH_ORDER.map((p) => p.username);
const complete: Record<string, Row> = { [C.username]: { mark: '12' }, [D.username]: { mark: '15' }, [A.username]: { mark: '17' }, [B.username]: { absent: true } };

describe('AT-10c the running product: accepted forms are stored as one number; a refused row is named beside it and nothing is published', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await marksWorld();
    browser = await chromium.launch();
    exam = await createExam(w, await as(w, HADEER), w.content.math, { title: 'Mid-term', max_mark: '20' });
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('17, 17.5, 17,5, ١٧٫٥ and " 17 " are stored as 17, 17.5, 17.5, 17.5 and 17', async () => {
    const hadeer = await as(w, HADEER);
    for (const [forms, expected] of [
      [{ [C.username]: '17', [D.username]: '17.5', [A.username]: '17,5', [B.username]: '١٧٫٥' }, [17, 17.5, 17.5, 17.5]],
      [{ [C.username]: ' 17 ', [D.username]: '١٧', [A.username]: '17٫5', [B.username]: '۱۷٫۵' }, [17, 17, 17.5, 17.5]],
    ] as const) {
      const rows = Object.fromEntries(Object.entries(forms).map(([u, mark]) => [u, { mark }]));
      const res = await hadeer.post(marksPath(w, exam), marksForm(w, everyone, rows, 'draft'));
      assert.equal(res.status, 303, `saved ${JSON.stringify(forms)}`);
      const stored = await storedRows(w, exam);
      assert.deepEqual(everyone.map((u) => stored[u].mark), [...expected]);
      assert.ok(everyone.every((u) => stored[u].status === 'marked' && stored[u].published_at === null), 'kept as a draft');
      // The page shows each as the one number, written one way.
      const shown = shownRows(await (await hadeer.get(marksPath(w, exam))).text());
      assert.deepEqual(shown.map((r) => r.typed), expected.map((n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))));
    }
  });

  for (const [what, row, message] of REFUSED) {
    it(`Publish with ${what} in A's row: refused with the error beside that row, nothing saved, nothing published`, async () => {
      const hadeer = await as(w, HADEER);
      assert.equal((await hadeer.post('/account/language', { lang: 'en' })).status, 303, 'Hadeer reads English');
      const before = await storedRows(w, exam);
      const res = await hadeer.post(marksPath(w, exam), marksForm(w, everyone, { ...complete, [A.username]: row }, 'publish'));
      assert.equal(res.status, 400);
      const html = await res.text();
      const rows = shownRows(html);
      const a = rows.find((r) => r.learner === w.ids[A.username])!;
      assert.equal(a.error, message, 'the error text beside A\'s row');
      assert.ok(rows.filter((r) => r.learner !== w.ids[A.username]).every((r) => r.error === ''), 'no error beside the other rows');
      assert.equal(a.typed, row.mark ?? '', 'the typed text is kept in the box');
      assert.match(html, /id="error"/, 'the page says nothing was saved or published');
      assert.equal(await count(w, 'SELECT COUNT(*) AS n FROM exam_result WHERE published_at IS NOT NULL'), 0, 'nothing published');
      assert.equal(await count(w, 'SELECT COUNT(*) AS n FROM exam_result_history'), 0, 'no history row');
      assert.deepEqual(await storedRows(w, exam), before, 'the draft is unchanged');
      assert.ok(!html.includes('id="confirm"'), 'no confirmation');
    });
  }

  it('Save draft refuses the same wrong forms (an empty row alone is allowed in a draft)', async () => {
    const hadeer = await as(w, HADEER);
    const before = await storedRows(w, exam);
    for (const [what, row] of REFUSED.filter(([what]) => !what.startsWith('an empty'))) {
      const res = await hadeer.post(marksPath(w, exam), marksForm(w, everyone, { ...complete, [A.username]: row }, 'draft'));
      assert.equal(res.status, 400, what);
      assert.deepEqual(await storedRows(w, exam), before, `${what}: the draft is unchanged`);
    }
    const res = await hadeer.post(marksPath(w, exam), marksForm(w, everyone, { ...complete, [A.username]: {} }, 'draft'));
    assert.equal(res.status, 303, 'a draft with an empty row is saved');
    assert.equal((await storedRows(w, exam))[A.username], undefined, 'and stores no row for it');
  });

  it('in a real browser at phone width: a refused row shows its error beside it (Arabic)', async () => {
    assert.equal((await (await as(w, HADEER)).post('/account/language', { lang: 'ar' })).status, 303, 'Hadeer reads Arabic again');
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, HADEER.username, HADEER.password);
    await ph.page.goto(w.p.url + marksPath(w, exam));
    const row = (u: string) => ph.page.locator(`#rows > li[data-learner="${w.ids[u]}"]`);
    await row(C.username).locator('input.mark').fill('12');
    await row(D.username).locator('input.mark').fill('1,7,5');
    await row(A.username).locator('input.mark').fill('17');
    await row(A.username).locator('input[type=checkbox]').check();
    await row(B.username).locator('input.mark').fill('');
    await row(B.username).locator('input[type=checkbox]').uncheck();
    assert.equal(await submit(ph.page, 'form#marks', 'button[value=publish]'), 400);
    await assertPage(ph.page, 'the refused marks page (Arabic)', 'ar');
    assert.equal((await row(D.username).locator('.row-error').innerText()).trim(), 'اكتب رقماً مثل 17 أو 17.5 (رقم عشري واحد على الأكثر).');
    assert.equal((await row(A.username).locator('.row-error').innerText()).trim(), 'اكتب الدرجة أو اختر «غائب»، لا الاثنين معاً.');
    assert.equal((await row(B.username).locator('.row-error').innerText()).trim(), 'اكتب الدرجة أو اختر «غائب».');
    assert.equal(await row(C.username).locator('.row-error').count(), 0);
    await shot(ph.page, EVIDENCE, '10c-1-refused-rows-ar');
    assert.equal(await count(w, 'SELECT COUNT(*) AS n FROM exam_result WHERE published_at IS NOT NULL'), 0, 'nothing published');
    await ph.ctx.close();
  });
});
