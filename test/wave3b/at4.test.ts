// LMS wave 3b, W3b-1 (product-contract v2 on PIL-232, AT-4): only the space's
// admin, only into their own space; mobile numbers stay hidden; limits hold.
// One test per labelled expectation (AT-4.1 to AT-4.6). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN, AMAL_END, END, HADEER, HEADER_EN, MIXED_NUMBERS, MONA, NOUR, SALMA, as, carriedForm, checkFile, classMixed, csv, donePath, pressAdd, sheetPath,
  snapshot, uploadIdOf, uploadPath, wave3bWorld, withNile, type Wave3aWorld,
} from './world.ts';
import { byId, textOf } from './pages.ts';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { UI } from '../../src/i18n/ui.ts';
import { makeLabel } from '../../src/labels.ts';
import { seedKit } from '../../src/kits/seed.ts';
import { addPeople, checkRows, fileText, fingerprint, readFile, type Place } from '../../src/upload.ts';
import { checkPage } from '../../src/views/upload.ts';

let w: Wave3aWorld;
before(async () => {
  w = await wave3bWorld();
});
after(async () => {
  await w?.close();
});

const idOf = async (username: string) => String((await w.p.sql(`SELECT id FROM user WHERE username = '${username}'`))[0]?.id ?? '');
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

let mesk: Promise<{ uploadId: string; form: { text: string; fp: string } }> | null = null;
/** One Mesk upload by Amal (once per world), and a fresh carried form of class-mixed.csv for the refused posts. */
function meskUpload() {
  mesk ??= (async () => {
    const amal = await as(w, ADMIN, 'en');
    const first = carriedForm(await (await checkFile(amal, w.school, csv([HEADER_EN, ['Mesk One', 'mesk1.t', 'Student', '01046464101', END]]))).text())!;
    const uploadId = uploadIdOf((await pressAdd(amal, w.school, first)).headers.get('location'));
    const form = carriedForm(await (await checkFile(amal, w.school, classMixed())).text())!;
    return { uploadId, form };
  })();
  return mesk;
}

/** Every database round trip of one request: each statement on its own, and each batch as one. */
async function roundTrips(run: () => Promise<Response>): Promise<{ res: Response; trips: string[] }> {
  const trips: string[] = [];
  let single = false;
  let inBatch = false;
  w.p.faults!.set({
    before: () => void (single = true),
    seen: (sql) => {
      if (/usage_day/.test(sql)) return; // the request counter, flushed after the answer (as every request)
      if (single) {
        trips.push(sql.replace(/\s+/g, ' ').slice(0, 80));
        single = false;
        inBatch = false;
      } else if (!inBatch) {
        trips.push(`batch: ${sql.replace(/\s+/g, ' ').slice(0, 60)}`);
        inBatch = true;
      }
    },
    after: () => void (inBatch = false),
  });
  try {
    const res = await run();
    await w.p.faults!.settle();
    return { res, trips };
  } finally {
    w.p.faults!.set({});
  }
}

describe('W3b AT-4', { concurrency: false }, () => {
  it('W3b AT-4.1 every other person is refused with today\'s answer before any upload work; other-space and unknown upload ids are 404', async () => {
    const { uploadId, form } = await meskUpload();
    const { id: nileId, nour } = await withNile(w);
    const who: [string, Client][] = [
      ['owner', w.owner], ['publisher', await as(w, HADEER, 'en')], ['learner', await as(w, SALMA, 'en')], ['guardian', await as(w, MONA, 'en')], ['other space admin', nour],
    ];
    const requests = (c: Client) => [
      ['GET upload page', () => c.get(uploadPath(w.school))], ['GET empty sheet', () => c.get(sheetPath(w.school))], ['GET done page', () => c.get(donePath(w.school, uploadId))],
      ['POST check', () => checkFile(c, w.school, classMixed())], ['POST add', () => pressAdd(c, w.school, form)],
    ] as const;
    const amal = await as(w, ADMIN, 'en');
    const before = await snapshot(w);
    for (const [name, c] of who) {
      for (const [what, send] of requests(c)) {
        const { res, trips } = await roundTrips(send);
        assert.equal(res.status, 403, `${name}: ${what} is 403`);
        assert.ok(!trips.some((s) => /class_upload|json_each/.test(s)), `${name}: ${what}: refused before any upload work`);
      }
    }
    // Ended admin: today's access-ended answer (the one her people page gets).
    const amalId = await idOf(ADMIN.username);
    await w.p.sql(`UPDATE membership SET valid_until = '${yesterday()}' WHERE space_id = '${w.school.id}' AND role = 'admin' AND user_id = '${amalId}'`);
    try {
      const today = await amal.get(`/s/${w.school.id}/admin/people`);
      const todayBody = textOf(byId(await today.text(), 'main') ?? '');
      for (const [what, send] of requests(amal)) {
        const { res, trips } = await roundTrips(send);
        assert.equal(res.status, today.status, `ended admin: ${what}: today's status (${today.status})`);
        if (byId(await res.clone().text(), 'main') !== null) assert.equal(textOf(byId(await res.text(), 'main') ?? ''), todayBody, `ended admin: ${what}: today's page`);
        assert.ok(!trips.some((s) => /class_upload|json_each/.test(s)), `ended admin: ${what}: before any upload work`);
      }
    } finally {
      await w.p.sql(`UPDATE membership SET valid_until = '${AMAL_END}' WHERE space_id = '${w.school.id}' AND role = 'admin' AND user_id = '${amalId}'`);
    }
    // Cross-site: a POST from another site is refused 403.
    for (const [what, path, body] of [['check', `/s/${w.school.id}/admin/upload/check`, (() => {
      const f = new FormData();
      f.set('file', new Blob([classMixed()], { type: 'text/csv' }), 'c.csv');
      return f;
    })()], ['add', `/s/${w.school.id}/admin/upload/add`, form]] as const) {
      const res = await amal.postWith(path, body as FormData | Record<string, string>, { origin: 'https://other-site.example' });
      assert.equal(res.status, 403, `cross-site: ${what} is 403`);
    }
    assert.deepEqual(await snapshot(w), before, 'nothing saved by any refused request');
    // Other space upload id, and an unknown id: 404, nothing from Mesk.
    for (const [what, id] of [['other space upload id', uploadId], ['unknown upload id', crypto.randomUUID()]]) {
      const res = await nour.get(donePath({ id: nileId }, id));
      assert.equal(res.status, 404, `${what}: 404`);
      const body = await res.text();
      assert.ok(!body.includes('Mesk One') && !body.includes('mesk1.t') && !body.includes(ADMIN.display_name), `${what}: nothing from Mesk`);
    }
  });

  it('W3b AT-4.2 rows go only into the space in the address; the form never names the space; a Mesk form posted to Nile is checked again', async () => {
    const { form } = await meskUpload();
    const { id: nileId, nour } = await withNile(w);
    const nile = { id: nileId };
    assert.equal((await nour.post('/account/language', { lang: 'en' })).status, 303);
    const end = utcDatePlusDays(30); // within Nour's own end date
    const file = csv([HEADER_EN, ['Salma Copy', 'salma.a', 'Student', '01046464201', end], ['Amal Copy', ADMIN.username, 'Student', '01046464202', end],
      ['Nile New', 'nilenew.t', 'Student', '01046464203', end]]);
    const html = await (await checkFile(nour, nile, file)).text();
    assert.ok(html.includes('Will be added: 1.') || textOf(byId(html, 'summary') ?? '').includes('Will be added: 1.'), 'only the new person passes');
    assert.equal((html.match(/data-reason="rowUsernameTaken"/g) ?? []).length, 2, 'the Mesk usernames are refused as in use');
    // The add, with extra fields naming Mesk School.
    const res = await pressAdd(nour, nile, carriedForm(html)!, { space_id: w.school.id, spaceId: w.school.id, space: w.school.id });
    assert.equal(res.status, 303);
    const rows = await w.p.sql(`SELECT m.space_id FROM membership m JOIN user u ON u.id = m.user_id WHERE u.username = 'nilenew.t'`);
    assert.deepEqual(rows.map((r) => r.space_id), [nileId], 'only into Nile');
    const upload = await w.p.sql(`SELECT space_id FROM class_upload WHERE id = '${uploadIdOf(res.headers.get('location'))}'`);
    assert.equal(upload[0].space_id, nileId, 'the upload row is Nile\'s');
    // The Mesk carried form posted to Nile's add: checked again for Nile, nothing saved.
    const before = await snapshot(w);
    const again = await pressAdd(nour, nile, form);
    assert.equal(again.status, 409, 'the fingerprint differs: the changed answer');
    assert.deepEqual(await snapshot(w), before, 'nothing saved');
    // A "space" column is not known (AT-1.3).
    const spaceCol = await checkFile(nour, nile, csv([[...HEADER_EN, 'Space'], ['X Test', 'xspace.t', 'Student', '01046464204', END, w.school.id]]));
    assert.equal(spaceCol.status, 400);
    assert.ok(textOf(byId(await spaceCol.text(), 'refusal') ?? '').includes('Not known: "Space".'));
  });

  it('W3b AT-4.3 mobile numbers stay hidden: only the last 4 digits on the check and done pages; no other role\'s page or log line has one', async () => {
    const amal = await as(w, ADMIN, 'en');
    w.p.faults!.clearLog();
    const html = await (await checkFile(amal, w.school, classMixed())).text();
    const forms = (n: string) => [n, n.replace('+20', '0'), n.replace('+', ''), n.slice(3)];
    const visible = html.replace(/<input type="hidden" name="text" value="[^"]*">/, '');
    assert.ok(html.includes('01046461001'), 'the carried file text holds the admin\'s own file');
    for (const n of MIXED_NUMBERS) for (const f of forms(n)) assert.ok(!visible.includes(f), `check page: no ${f} outside the carried text`);
    assert.ok(textOf(visible).includes('mobile ending 1001'), 'the last 4 digits');
    const res = await pressAdd(amal, w.school, carriedForm(html)!);
    const done = await (await amal.get(res.headers.get('location')!)).text();
    for (const n of MIXED_NUMBERS) for (const f of forms(n)) assert.ok(!done.includes(f), `done page: no ${f}`);
    // Other roles: every page each reaches (a crawl of their own links) shows no new person's number.
    for (const who of [HADEER, SALMA, MONA]) {
      const c = await as(w, who, 'en');
      const seen = new Set<string>();
      const queue = ['/'];
      while (queue.length && seen.size < 60) {
        const path = queue.shift()!;
        if (seen.has(path)) continue;
        seen.add(path);
        const r = await c.get(path);
        const loc = r.headers.get('location');
        if (loc && loc.startsWith('/')) queue.push(loc);
        if (!(r.headers.get('content-type') ?? '').includes('text/html')) continue;
        const body = await r.text();
        for (const n of MIXED_NUMBERS) for (const f of forms(n)) assert.ok(!body.includes(f), `${who.username} ${path}: no ${f}`);
        for (const m of body.matchAll(/href="(\/[^"#?]*)"/g)) if (!/signout|\/r\//.test(m[1])) queue.push(m[1]);
      }
      assert.ok(seen.size > 1, `${who.username}: pages crawled (${seen.size})`);
    }
    await w.p.faults!.settle();
    for (const line of w.p.faults!.log()) for (const n of MIXED_NUMBERS) for (const f of forms(n)) assert.ok(!line.includes(f), `log: no ${f}`);
  });

  it('W3b AT-4.4 every upload answer carries no-store and no-referrer; the forms have autocomplete off; the empty sheet is an attachment with the header only', async () => {
    const amal = await as(w, ADMIN, 'en');
    const { uploadId } = await meskUpload();
    const file = csv([HEADER_EN, ['Head One', 'head1.t', 'Student', '01046464301', END]]);
    const check = await checkFile(amal, w.school, file);
    const checkHtml = await check.clone().text();
    const form = carriedForm(checkHtml)!;
    const answers: [string, Response][] = [
      ['upload page', await amal.get(uploadPath(w.school))],
      ['check page', check],
      ['whole-file refusal', await checkFile(amal, w.school, '')],
      ['add 409', await pressAdd(amal, w.school, { ...form, fp: 'x' })],
    ];
    w.p.faults!.set({ rewrite: (sql, p) => (/^\s*INSERT INTO class_upload/.test(sql) ? ['INSERT INTO no_such_table VALUES (1)', []] : [sql, p]) });
    try {
      answers.push(['add failure', await pressAdd(amal, w.school, form)]);
    } finally {
      w.p.faults!.set({});
    }
    const ok = await pressAdd(amal, w.school, form);
    answers.push(['add 303', ok], ['done page', await amal.get(ok.headers.get('location')!)], ['done page (again)', await amal.get(`${donePath(w.school, uploadId)}?again=1`)]);
    const sheet = await amal.get(sheetPath(w.school));
    answers.push(['empty sheet', sheet]);
    for (const [what, res] of answers) {
      assert.equal(res.headers.get('cache-control'), 'no-store', `${what}: Cache-Control: no-store`);
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer', `${what}: Referrer-Policy: no-referrer`);
    }
    assert.deepEqual(answers.slice(3, 5).map(([, r]) => r.status), [409, 500]);
    assert.equal(ok.status, 303);
    const uploadHtml = await (await amal.get(uploadPath(w.school))).text();
    assert.match(uploadHtml, /<form id="upload"[^>]*autocomplete="off"/, 'the upload form');
    assert.match(checkHtml, /<form id="add-form"[^>]*autocomplete="off"/, 'the check form');
    assert.match(sheet.headers.get('content-disposition') ?? '', /^attachment\b/, 'the empty sheet is an attachment');
    const bytes = new Uint8Array(await sheet.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 byte-order mark');
    const text = new TextDecoder().decode(bytes.slice(3));
    assert.equal(text.replace(/\r?\n$/, ''), [UI.ar.displayName, UI.ar.username, UI.ar.roleField, UI.ar.mobile, UI.ar.endDate].join(','), 'only the header line, in the space\'s first language');
  });

  it('W3b AT-4.5 the server holds the limits, re-runs every rule, and makes at most 2 round trips besides the gate\'s', async (t) => {
    const amal = await as(w, ADMIN, 'en');
    const gate = (await roundTrips(() => amal.get(uploadPath(w.school)))).trips;
    const file = csv([HEADER_EN, ...Array.from({ length: 100 }, (_, i) => [`Trip Test ${i}`, `trip${i}.t`, 'Student', `010464650${String(i).padStart(2, '0')}`, END])]);
    const check = await roundTrips(() => checkFile(amal, w.school, file));
    assert.equal(check.res.status, 200);
    const html = await check.res.text();
    const add = await roundTrips(() => pressAdd(amal, w.school, carriedForm(html)!));
    assert.equal(add.res.status, 303);
    t.diagnostic(`gate round trips (upload page GET): ${gate.length} ${JSON.stringify(gate)}`);
    t.diagnostic(`check round trips: ${check.trips.length} ${JSON.stringify(check.trips)}`);
    t.diagnostic(`add round trips: ${add.trips.length} ${JSON.stringify(add.trips)}`);
    assert.ok(check.trips.length - gate.length <= 2, `the check: at most 2 plus the gate's (${check.trips.length - gate.length})`);
    assert.ok(add.trips.length - gate.length <= 2, `the add: one username lookup and one batch besides the gate's (${add.trips.length - gate.length})`);
    assert.equal(add.trips.filter((s) => s.startsWith('batch:')).length, 1, 'one batch');
    assert.equal(add.trips.filter((s) => /default_country_code AS cc, u.username/.test(s)).length, 1, 'one username lookup');
    // Limits on the server: 101 rows or more than 64 KB of carried text are refused; every rule runs again.
    const big = csv([HEADER_EN, ...Array.from({ length: 101 }, (_, i) => [`Big ${i}`, `big${i}.t`, 'Student', '01046466000', END])]);
    const before = await snapshot(w);
    const tooMany = await pressAdd(amal, w.school, { text: big, fp: 'x' });
    assert.equal(tooMany.status, 400, '101 rows refused by the add');
    const huge = csv([HEADER_EN, ['Huge ' + 'x'.repeat(66_000), 'huge.t', 'Student', '01046466001', END]]);
    assert.equal((await pressAdd(amal, w.school, { text: huge, fp: 'x' })).status, 400, 'more than 64 KB refused by the add');
    const forged = await checkFile(amal, w.school, csv([HEADER_EN, ['Rule Again', 'ruleagain.t', 'Administrator', '01046466002', END]]));
    assert.equal(carriedForm(await forged.text()), null, 'nothing to add');
    const editedText = csv([HEADER_EN, ['Rule Again', 'ruleagain.t', 'Administrator', '01046466002', END]]);
    assert.equal((await pressAdd(amal, w.school, { text: editedText, fp: 'x' })).status, 409, 'a refused row posted to the add is refused again');
    assert.deepEqual(await snapshot(w), before, 'nothing saved');
  });

  it('W3b AT-4.6 CPU gate: the median CPU time of the check and of the add of a worst-case file is at most 5 ms each', async (t) => {
    const kit = seedKit('school');
    const countryCode = String((await w.p.sql(`SELECT default_country_code AS cc FROM space WHERE id = '${w.school.id}'`))[0].cc);
    const place: Place = { spaceId: w.school.id, adminId: await idOf(ADMIN.username), kit, today: new Date().toISOString().slice(0, 10), ownEnd: AMAL_END };
    const arabic = 'محمد أحمد عبد الرحمن، ';
    const name = (i: number) => (arabic.repeat(5) + String(i)).slice(0, 100);
    const bytes = new TextEncoder().encode(csv([HEADER_EN, ...Array.from({ length: 100 }, (_, i) => [name(i), `worst.case.user.${String(i).padStart(3, '0')}.t`, 'Student', `010464670${String(i).padStart(2, '0')}`, END])]));
    assert.ok(bytes.length <= 64 * 1024, `the worst case fits 64 KB (${bytes.length})`);
    const tl = makeLabel('ar', kit);
    const view = { id: w.school.id, name: 'Mesk', primaryColor: '#0b5', hasLogo: false };
    const noDb = { batch: async () => [] } as never;
    async function checkWork() {
      const read = fileText(bytes) as { text: string };
      const file = readFile(read.text) as Exclude<ReturnType<typeof readFile>, { kind: string }>;
      const rows = checkRows(place, countryCode, file.columns, file.rows, new Set());
      const add = rows.filter((r) => r.person);
      assert.equal(add.length, 100, 'every row passes');
      const fp = await fingerprint(place, add);
      const page = await checkPage(tl, 'ar', view, { checked: { rows: rows.length, refused: [], add, fingerprint: fp }, text: read.text, ownEnd: place.ownEnd });
      return { fp, size: String(page).length };
    }
    const carried = (await checkWork()).fp;
    async function addWork() {
      const read = fileText(bytes) as { text: string };
      const file = readFile(read.text) as Exclude<ReturnType<typeof readFile>, { kind: string }>;
      const rows = checkRows(place, countryCode, file.columns, file.rows, new Set());
      const add = rows.filter((r) => r.person);
      assert.equal(await fingerprint(place, add), carried);
      await addPeople(noDb, place, { add, refused: 0, iterations: 100_000, now: Date.now() });
    }
    const median = async (work: () => Promise<unknown>) => {
      for (let i = 0; i < 5; i++) await work();
      const runs: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = process.cpuUsage();
        await work();
        const d = process.cpuUsage(start);
        runs.push((d.user + d.system) / 1000);
      }
      runs.sort((a, b) => a - b);
      return (runs[9] + runs[10]) / 2;
    };
    const c = await median(checkWork);
    const a = await median(addWork);
    t.diagnostic(`CPU median of 20 runs after 5 warm-ups: check ${c.toFixed(3)} ms, add ${a.toFixed(3)} ms (gate: at most 5 ms each)`);
    assert.ok(c <= 5, `check median ${c.toFixed(3)} ms <= 5 ms`);
    assert.ok(a <= 5, `add median ${a.toFixed(3)} ms <= 5 ms`);
  });
});

void NOUR;
