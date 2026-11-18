// LMS wave 3b, W3b-1 (product-contract v2 on PIL-232, AT-1): the check lists
// every row, and saves nothing. One test per labelled expectation (AT-1.1 to
// AT-1.7); each CI step selects its test by name.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import {
  ADMIN, COMPANY_ADMIN, END, HEADER_AR, HEADER_EN, MIXED, TRICKY_NAMES, as, browserAs, carriedForm, checkFile, classMixed, classTricky, csv,
  snapshot, spied, uploadPath, wave3bWorld, withNile, word, writes, type Wave3aWorld,
} from './world.ts';
import { WHOLE_FILES, byId, ruleRows, tableRows, textOf } from './pages.ts';
import { utcDatePlusDays } from '../support/http.ts';

let w: Wave3aWorld;
before(async () => {
  w = await wave3bWorld();
});
after(async () => {
  await w?.close();
});

describe('W3b AT-1', { concurrency: false }, () => {
  it('W3b AT-1.1 the check page counts and lists every row, the refused first with all their reasons, then the rows to add', async () => {
    const amal = await as(w, ADMIN, 'en');
    const people = await (await amal.get(`/s/${w.school.id}/admin/people`)).text();
    const entry = /<a id="upload-entry"[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/.exec(people);
    assert.ok(entry, 'the people page has the entry link');
    assert.equal(entry[1], uploadPath(w.school));
    assert.equal(entry[2], 'Add from a spreadsheet');
    assert.equal((await amal.get(entry[1])).status, 200, 'following it opens the upload page');

    const res = await checkFile(amal, w.school, classMixed(), 'class-mixed.csv');
    assert.equal(res.status, 200);
    const html = await res.text();
    const summary = textOf(byId(html, 'summary') ?? '');
    assert.ok(summary.includes('Rows: 12. Will be added: 8. Refused: 4.'), summary);
    assert.ok(summary.includes('Nothing is saved yet.'), summary);
    assert.ok(html.indexOf('id="refused-rows"') < html.indexOf('id="add-rows"'), 'the refused rows come first');
    const refused = tableRows(html, 'refused-rows');
    assert.deepEqual(refused.map((r) => r.row), [4, 9, 11, 12], 'every refused row by its spreadsheet row number');
    assert.deepEqual(refused[0].reasons, ['This username is already in use.', 'Mobile number cannot be read.'], 'row 4: both reasons');
    assert.deepEqual(refused[1].reasons, ['Role: only Teacher, Student or Parent.'], 'row 9');
    assert.deepEqual(refused[2].reasons, ['This username is on more than one row: 11, 12.'], 'row 11');
    assert.deepEqual(refused[3].reasons, ['This username is on more than one row: 11, 12.'], 'row 12');
    const add = tableRows(html, 'add-rows');
    assert.deepEqual(add.map((r) => r.row), [2, 3, 5, 6, 7, 8, 10, 13], 'every row to add');
    const roles: Record<number, string> = { 8: 'Parent', 10: 'Parent', 13: 'Teacher' };
    for (const r of add) {
      const source = MIXED[r.row - 1];
      const cells = r.cells.map(textOf);
      assert.equal(cells[0], `Row ${r.row}`);
      assert.equal(cells[1], source[0], `row ${r.row}: the name`);
      assert.equal(cells[2], source[1], `row ${r.row}: the username`);
      assert.equal(cells[3], roles[r.row] ?? 'Student', `row ${r.row}: the role word`);
      assert.equal(cells[4], `mobile ending ${source[3].slice(-4)}`, `row ${r.row}: the last 4 digits`);
      assert.equal(cells[5], '30 June 2027', `row ${r.row}: the end date`);
    }
    assert.equal(textOf(byId(html, 'add-form') ?? ''), 'Add the people listed (8)');
  });

  it('W3b AT-1.2 every check saves nothing but the usage_day counter, runs only reads, logs nothing and makes no reset link', async (t) => {
    await withNile(w);
    const amal = await as(w, ADMIN, 'en');
    const files: (string | Uint8Array)[] = [classMixed(), classTricky(), ...WHOLE_FILES.map((f) => f.content), csv([HEADER_EN, ...ruleRows().map((r) => r.fields)]), ...acceptedForms().map((f) => f.text)];
    const before = await snapshot(w);
    w.p.faults!.clearLog();
    const all: string[] = [];
    for (const content of files) {
      const { result, statements } = await spied(w, () => checkFile(amal, w.school, content));
      assert.ok([200, 400].includes(result.status), `a check answers 200 or 400 (${result.status})`);
      all.push(...statements);
    }
    const written = writes(all);
    t.diagnostic(`checks: ${files.length}; statements: ${all.length}; writes: ${JSON.stringify([...new Set(written.map((s) => s.replace(/\s+/g, ' ').slice(0, 60)))])}`);
    t.diagnostic('the gate\'s only write: the usage_day request counter (INSERT INTO usage_day … ON CONFLICT … DO UPDATE), flushed at most once a minute');
    assert.ok(written.every((s) => /^\s*INSERT INTO usage_day\b/.test(s)), 'every statement is a read but the usage_day counter');
    assert.deepEqual(await snapshot(w), before, 'every row of every table but usage_day is identical');
    assert.deepEqual(w.p.faults!.log(), [], 'no log line');
    assert.equal(Number((await w.p.sql("SELECT COUNT(*) AS n FROM reset_link r JOIN user u ON u.id = r.user_id WHERE u.username LIKE '%.t'"))[0].n), 0, 'no reset link for anyone new');
  });

  it('W3b AT-1.3 each whole-file refusal is the upload page with one message, nothing listed, nothing saved', async () => {
    const amal = await as(w, ADMIN, 'en');
    const before = await snapshot(w);
    for (const f of WHOLE_FILES) {
      const res = await checkFile(amal, w.school, f.content, f.name.includes('xlsx') ? 'class.xlsx' : f.name.includes('pdf') ? 'class.pdf' : 'class.csv');
      assert.equal(res.status, 400, `${f.name}: 400`);
      const html = await res.text();
      assert.equal(textOf(byId(html, 'refusal') ?? ''), f.message, `${f.name}: the message`);
      assert.ok(html.includes('id="upload"') && html.includes('name="file"'), `${f.name}: on the upload page`);
      assert.ok(!html.includes('id="refused-rows"') && !html.includes('id="add-rows"') && !html.includes('id="add-form"'), `${f.name}: nothing listed`);
    }
    assert.deepEqual(await snapshot(w), before, 'nothing saved');
  });

  it('W3b AT-1.4 each row rule refuses that row only, with its reason', async () => {
    await withNile(w);
    const amal = await as(w, ADMIN, 'en');
    const rules = ruleRows();
    const html = await (await checkFile(amal, w.school, csv([HEADER_EN, ...rules.map((r) => r.fields)]))).text();
    const refused = new Map(tableRows(html, 'refused-rows').map((r) => [r.row, r.reasons]));
    const add = tableRows(html, 'add-rows').map((r) => r.row);
    rules.forEach((r, i) => {
      const row = i + 2;
      if (r.reason === null) assert.ok(add.includes(row), `row ${row} passes`);
      else assert.deepEqual(refused.get(row), [r.reason], `row ${row} (${JSON.stringify(r.fields)}): only its reason`);
    });
    assert.deepEqual(add, [25], 'only the valid row is to be added');
  });

  it('W3b AT-1.5 the accepted forms pass, dates show the month as a word, and rows are numbered as the spreadsheet does', async () => {
    const amal = await as(w, ADMIN, 'en');
    const basem = await as(w, COMPANY_ADMIN, 'en');
    for (const f of acceptedForms()) {
      const res = f.company ? await checkFile(basem, w.company, f.text) : await checkFile(amal, w.school, f.text);
      const html = await res.text();
      assert.equal(res.status, 200, `${f.name}: 200`);
      assert.deepEqual(tableRows(html, 'refused-rows').map((r) => r.reasons), [], `${f.name}: nothing refused`);
      assert.equal(tableRows(html, 'add-rows').length, f.rows, `${f.name}: every row to add`);
      for (const [row, role] of Object.entries(f.roles ?? {})) {
        assert.equal(textOf(tableRows(html, 'add-rows').find((r) => r.row === Number(row))!.cells[3]), role, `${f.name}: row ${row} is a ${role}`);
      }
    }
    // Dates: both forms show as "3 June 2027", in English and (one shared formatter) in Arabic.
    const dates = csv([HEADER_EN, ['Date One', 'date1.t', 'Student', '01046466001', '03/06/2027'], ['Date Two', 'date2.t', 'Student', '01046466002', '2027-06-03']]);
    for (const lang of ['en', 'ar'] as const) {
      const c = await as(w, ADMIN, lang);
      const rows = tableRows(await (await checkFile(c, w.school, dates)).text(), 'add-rows');
      const shown = lang === 'en' ? '3 June 2027' : `3 ${word('ar', 'monthWords').split(',')[5]} 2027`;
      assert.deepEqual(rows.map((r) => textOf(r.cells[5])), [shown, shown], `${lang}: the month as a word`);
    }
    // Row numbers: a quoted name over two lines is row 5 (refused), row 7 is blank, the next records are rows 6 and 8.
    const numbering = csv([HEADER_EN, ['Num Two', 'num2.t', 'Student', '01046467002', END], ['Num Three', 'num3.t', 'Student', '01046467003', END],
      ['Num Four', 'num4.t', 'Student', '01046467004', END], ['Num\nFive', 'num5.t', 'Student', '01046467005', END], ['Num Six', 'num6.t', 'Student', '01046467006', END]])
      + '\r\n' + csv([['Num Eight', 'num8.t', 'Student', '01046467008', END]]);
    // A person's language is stored on the person: set English again after the Arabic page.
    const html = await (await checkFile(await as(w, ADMIN, 'en'), w.school, numbering)).text();
    assert.deepEqual(tableRows(html, 'refused-rows').map((r) => [r.row, r.reasons]), [[5, ['Name: 1 to 100 characters, on one line.']]]);
    assert.deepEqual(tableRows(html, 'add-rows').map((r) => r.row), [2, 3, 4, 6, 8]);
    assert.ok(textOf(byId(html, 'summary') ?? '').includes('Rows: 6. Will be added: 5. Refused: 1.'), 'the blank row 7 is not counted');
  });

  it('W3b AT-1.6 with script off the check works the same (plain multipart form, plain page)', async () => {
    const browser: Browser = await chromium.launch();
    try {
      const tab = await browserAs(browser, w, ADMIN, { lang: 'en', script: false });
      await tab.page.goto(`${w.p.url}/s/${w.school.id}/admin/people`);
      await Promise.all([tab.page.waitForEvent('load'), tab.page.click('#upload-entry')]);
      assert.ok(tab.page.url().endsWith(uploadPath(w.school)), 'the upload page');
      assert.equal(await tab.page.getAttribute('form#upload', 'enctype'), 'multipart/form-data');
      await tab.page.setInputFiles('#upload-file', { name: 'class-mixed.csv', mimeType: 'text/csv', buffer: Buffer.from(classMixed()) });
      await Promise.all([tab.page.waitForEvent('load'), tab.page.click('form#upload button[type=submit]')]);
      const html = await tab.page.content();
      assert.ok(textOf(byId(html, 'summary') ?? '').includes('Rows: 12. Will be added: 8. Refused: 4.'), 'the same summary');
      assert.deepEqual(tableRows(html, 'refused-rows').map((r) => r.row), [4, 9, 11, 12]);
      assert.deepEqual(tableRows(html, 'add-rows').map((r) => r.row), [2, 3, 5, 6, 7, 8, 10, 13]);
      // The same check in Arabic: the Arabic words of the same keys.
      const ar = await as(w, ADMIN, 'ar');
      const arHtml = await (await checkFile(ar, w.school, classMixed())).text();
      assert.ok(textOf(byId(arHtml, 'summary') ?? '').includes(textOf(word('ar', 'checkSummary', { rows: '12', add: '8', refused: '4' }))), 'Arabic summary');
      assert.ok(textOf(byId(arHtml, 'summary') ?? '').includes(word('ar', 'checkNothingSaved')));
      await tab.ctx.close();
    } finally {
      await browser.close();
    }
  });

  it('W3b AT-1.7 names from the file are shown as text, each in its own bdi, and the carried field returns them byte for byte', async () => {
    const amal = await as(w, ADMIN, 'en');
    const text = classTricky();
    const html = await (await checkFile(amal, w.school, text)).text();
    assert.equal(carriedForm(html)?.text, text, 'the carried field returns the file byte for byte');
    for (const name of TRICKY_NAMES) {
      const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      assert.ok(html.includes(`<bdi>${escaped}</bdi>`), `${JSON.stringify(name)}: escaped, in its own <bdi>`);
    }
    assert.ok(!/<script>alert|<b>x<\/b>|<\/textarea><b>/.test(html), 'no markup from the file');
    const refused = tableRows(html, 'refused-rows');
    assert.deepEqual(refused.map((r) => [r.row, r.reasons]), [[4, ['Name: 1 to 100 characters, on one line.']]], 'the U+202E name is refused by today\'s name rule');
    for (const r of [...refused, ...tableRows(html, 'add-rows')]) {
      for (const cell of r.cells.slice(1, 3)) assert.match(cell, /^<bdi( dir="ltr")?>[^<]*<\/bdi>$/, `row ${r.row}: name and username each in their own <bdi>`);
    }
    // In a browser: the page gains no element, attribute or script from the file.
    const browser = await chromium.launch();
    try {
      const tab = await browserAs(browser, w, ADMIN, { lang: 'en' });
      await tab.page.goto(`${w.p.url}${uploadPath(w.school)}`);
      await tab.page.setInputFiles('#upload-file', { name: 'class-tricky.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
      await Promise.all([tab.page.waitForEvent('load'), tab.page.click('form#upload button[type=submit]')]);
      const dom = await tab.page.evaluate(() => ({
        scripts: document.querySelectorAll('script').length, bold: document.querySelectorAll('main b, main textarea').length,
        names: [...document.querySelectorAll('td.name bdi')].map((e) => e.textContent),
        attrs: [...document.querySelectorAll('main *')].flatMap((e) => [...e.attributes].map((a) => a.name)).filter((n) => n.startsWith('on')),
      }));
      assert.equal(dom.scripts, 1, 'only the page\'s own script');
      assert.equal(dom.bold, 0, 'no element from the file');
      assert.deepEqual(dom.attrs, [], 'no event attribute');
      assert.deepEqual([...dom.names].sort(), [...TRICKY_NAMES].sort(), 'every name literally as typed');
      // After the add: the done page and the people list show them literally, and the add saved exactly those names.
      await Promise.all([tab.page.waitForEvent('load'), tab.page.click('#add')]);
      // From W3b-1b the done page has one script of its own (focus on the row after "Back to the upload"), as the check page has.
      const done = await tab.page.evaluate(() => ({ names: [...document.querySelectorAll('#added a.person bdi')].map((e) => e.textContent), bold: document.querySelectorAll('main b').length, scripts: document.querySelectorAll('main script').length }));
      const added = TRICKY_NAMES.filter((n) => !n.includes('‮'));
      assert.deepEqual([...done.names].sort(), [...added].sort(), 'the done page');
      assert.equal(done.bold, 0, 'the done page gains no element');
      assert.equal(done.scripts, 1, 'the done page gains no script: only its own');
      await tab.page.goto(`${w.p.url}/s/${w.school.id}/admin/people`);
      const listed = await tab.page.evaluate(() => [...document.querySelectorAll('#people a.person bdi')].map((e) => e.textContent ?? ''));
      for (const n of added) assert.ok(listed.includes(n), `the people list shows ${JSON.stringify(n)}`);
      assert.equal(await tab.page.locator('main b').count(), 0, 'the people list gains no element');
      const saved = (await w.p.sql("SELECT display_name FROM user WHERE username LIKE 'tricky%'")).map((r) => String(r.display_name)).sort();
      assert.deepEqual(saved, [...added].sort(), 'the add saved exactly those names');
      await tab.ctx.close();
    } finally {
      await browser.close();
    }
  });
});

/** The accepted forms of AT-1.5: each a file whose every row passes. */
function acceptedForms(): { name: string; text: string; rows: number; company?: boolean; roles?: Record<number, string> }[] {
  const r = (u: string, role = 'Student', mobile = '01046468001', end = END) => [`Form ${u}`, u, role, mobile, end];
  return [
    { name: 'English header, another order, other letter case', text: csv([['END DATE', 'role', 'Name', 'mobile number', 'USERNAME'], ['2027-06-30', 'Student', 'Form a', '01046468001', 'forma.t']]), rows: 1 },
    { name: 'Arabic header with diacritics', text: csv([['تاريخُ الانتهاء', 'الدّور', 'اسم المستخدم', 'الاسم', 'رقم الهاتف المحمول'], ['2027-06-30', 'طالب', 'formb.t', 'Form b', '01046468002']]), rows: 1 },
    { name: 'semicolon separator', text: csv([HEADER_EN, r('formc.t'), ['Form, with comma', 'formc2.t', 'Student', '01046468003', END]], ';'), rows: 2 },
    { name: 'a UTF-8 byte-order mark', text: '﻿' + csv([HEADER_AR, r('formd.t')]), rows: 1 },
    { name: 'quoted fields with commas and quotes', text: csv([HEADER_EN, ['Test "Q" Name, Jr', 'forme.t', 'Student', '01046468004', END]]), rows: 1 },
    { name: 'blank rows ignored', text: csv([HEADER_EN, r('formf.t'), [''], ['', '', '', '', ''], r('formf2.t', 'Student', '01046468005')]), rows: 2 },
    { name: 'Arabic-Indic digits in mobile and date', text: csv([HEADER_EN, ['Form g', 'formg.t', 'Student', '٠١٠٤٦٤٦٨٠٠٦', '٣٠/٠٦/٢٠٢٧']]), rows: 1 },
    { name: 'both date forms (day first)', text: csv([HEADER_EN, r('formh.t', 'Student', '01046468007', '30/06/2027'), r('formh2.t', 'Student', '01046468008', '2027-06-30')]), rows: 2 },
    { name: 'a local mobile with or without its leading 0', text: csv([HEADER_EN, r('formi.t', 'Student', '01046468009'), r('formi2.t', 'Student', '1046468010')]), rows: 2 },
    {
      name: 'role words in either language, with or without shadda, and the codes',
      text: csv([HEADER_EN, r('formj1.t', 'Teacher'), r('formj2.t', 'معلّم'), r('formj3.t', 'معلم'), r('formj4.t', 'student'), r('formj5.t', 'طالب'),
        r('formj6.t', 'parent'), r('formj7.t', 'ولي أمر'), r('formj8.t', 'publisher'), r('formj9.t', 'learner'), r('formj10.t', 'guardian')]),
      rows: 10, roles: { 2: 'Teacher', 3: 'Teacher', 4: 'Teacher', 5: 'Student', 6: 'Student', 7: 'Parent', 8: 'Parent', 9: 'Teacher', 10: 'Student', 11: 'Parent' },
    },
    {
      name: 'the Company kit: Employee and موظف are learners', company: true,
      text: csv([HEADER_EN, r('formk1.t', 'Employee', '01046468011', utcDatePlusDays(30)), r('formk2.t', 'موظف', '01046468012', utcDatePlusDays(30))]),
      rows: 2, roles: { 2: 'Employee', 3: 'Employee' },
    },
  ];
}
