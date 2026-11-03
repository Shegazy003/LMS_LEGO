// Hardening task H-1 (docs/09-CONTRACT-R1.1.md section 4): no product log line
// holds a password, a token, a full mobile number or a session id.
//
// Workers Logs keeps every line the Worker writes to the console for three
// days in the owner's account (wrangler.jsonc "observability"; request logs
// are off, test/deploy/logs-config.test.ts). The guard has three parts:
// 1. Source: the only console call in src/ is in src/log.ts, and every product
//    log line is logError('<fixed event>') or logError('<fixed event>', err)
//    with the caught error: nothing from a request is ever handed to it.
// 2. Scrubbing: an error message that carries a value anyway loses its tokens,
//    session ids, hashes and mobile numbers (src/log.ts redact).
// 3. Running product: every flow that handles a secret (owner setup and its
//    recovery code, appointing people with mobile numbers, sign-in, a reset
//    link opened, refused and used, the person's own password change) runs
//    through the real router (test/support/in-process.ts), with database
//    failures forced on the statements that carry a session id, a reset
//    token's hash or a mobile number, and errors whose message repeats those
//    values and the reset link's address. Every line the product wrote is then
//    searched for every secret of the run.
// Each part checks itself first on a planted case, so a pass means something.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { OWNER, appointAdmin, createSpace, seed, signedIn } from '../support/seed.ts';
import { issueLink } from '../support/admin.ts';
import { startInProcess, type InProcessWorker } from '../support/in-process.ts';
import { logLine, redact } from '../../src/log.ts';
import { tokenHash } from '../../src/auth/tokens.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const LOG_MODULE = 'src/log.ts';
const EVENTS = ['usage flush failed', 'request failed'];

// ------------------------------------------------------------- 1. source ----
function sourceFiles(dir = join(root, 'src')): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Every problem with how a source file logs: console used outside src/log.ts, or logError given anything but a fixed event and the caught error. */
export function loggingProblems(file: string, text: string): string[] {
  const code = withoutComments(text);
  const problems: string[] = [];
  if (file !== LOG_MODULE && /\bconsole\b/.test(code)) problems.push(`${file}: uses console directly (only ${LOG_MODULE} may)`);
  for (const m of code.matchAll(/\blogError\s*\(([^)]*)\)/g)) {
    if (file === LOG_MODULE) continue;
    if (!/^\s*'[^'\\]+'\s*(,\s*err\s*)?$/.test(m[1])) problems.push(`${file}: logError(${m[1].trim()}) logs something other than a fixed event and the caught error`);
  }
  return problems;
}

describe('no-secrets guard, part 1: product code logs only through src/log.ts, with fixed events', () => {
  it('self-check: planted log lines are found', () => {
    assert.ok(loggingProblems('src/reset.ts', "console.log('reset link used', c.req.url);").length, 'a direct console call');
    assert.ok(loggingProblems('src/app.ts', "logError('request failed', password);").length, 'a password handed to the logger');
    assert.ok(loggingProblems('src/app.ts', 'logError(`sign-in ${username}`, err);').length, 'a built event');
    assert.ok(loggingProblems('src/app.ts', "globalThis.console.error(token)").length, 'console reached another way');
    assert.deepEqual(loggingProblems('src/app.ts', "logError('request failed', err);\n// console.log('a comment')"), [], 'the allowed form');
  });

  it('every source file in src/ passes', () => {
    const files = sourceFiles();
    assert.ok(files.length > 20 && files.some((f) => f.endsWith('log.ts')), 'the scan sees the product source');
    const problems = files.flatMap((f) => loggingProblems(relative(root, f).replace(/\\/g, '/'), readFileSync(f, 'utf8')));
    assert.deepEqual(problems, []);
  });

  it('the product logs at most two kinds of line, each from one place', () => {
    const sites = sourceFiles()
      .filter((f) => !f.endsWith('log.ts'))
      .flatMap((f) => [...withoutComments(readFileSync(f, 'utf8')).matchAll(/\blogError\s*\(\s*'([^']+)'/g)].map((m) => m[1]));
    assert.deepEqual(sites.sort(), [...EVENTS].sort());
  });
});

// ---------------------------------------------------------- 2. scrubbing ----
describe('no-secrets guard, part 2: an error message that carries a value is scrubbed', () => {
  const token = 'q3Jx_9Lm-2ZtR8vYk1WcPq7sNd4HbFe6UoAi0GyTr5E';
  const sessionId = 'f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f';
  const hash = 'pbkdf2-sha256$10000$kBUYJ6Apq0J3zuuu7GZZkw$qo3TNXhowWVZMXhznE0PqhLtIkqDX3Re2jB8m4eLGPY';
  for (const [what, value] of [
    ['a reset token in an address', `/r/${token}`],
    ['a session id', sessionId],
    ['a stored password hash', hash],
    ['a mobile number in international form', '+201055556666'],
    ['a mobile number as typed', '01055556666'],
    ['a mobile number with spaces', '010 5555 6666'],
    ['a reset token that happens to hold no digit', 'qJx_Lm-ZtRvYkWcPqsNdHbFeUoAiGyTrEabcdefghij'],
    ['a recovery code', 'ABCD-EFGH-JKLM-NPQR'],
    ['the values a statement was given: a learner name and a mark (R2-b)', '["marked",17.5,"Omar Test"]'],
  ] as const) {
    it(`${what} is removed`, () => {
      const line = logLine('request failed', new Error(`D1_ERROR: failed with ${value} here`));
      assert.ok(!line.includes(value), line);
      for (const piece of value.split(/[/$ ]/).filter((p) => p.length >= 16 && /\d/.test(p))) assert.ok(!line.includes(piece), `${line} holds ${piece}`);
      assert.match(line, /\[redacted\]/);
    });
  }
  it('a line is one JSON object with a known event, and short', () => {
    const line = logLine('request failed', new Error('x'.repeat(5000)));
    const parsed = JSON.parse(line);
    assert.ok(EVENTS.includes(parsed.event));
    assert.ok(line.length < 400, `${line.length} characters`);
    assert.equal(redact('ordinary words stay'), 'ordinary words stay');
    assert.equal(redact('PASSWORD_ITERATIONS must be a whole number'), 'PASSWORD_ITERATIONS must be a whole number', 'a setting\'s name stays readable');
  });
});

// ---------------------------------------------------- 3. running product ----
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-secret-pass-1', mobile: '01012345678' };
const OMAR = { display_name: 'Omar', username: 'omar', password: 'omar-secret-pass-1', role: 'learner', mobile: '0105 555 6666' };
const OMAR_NEW = 'omar-secret-pass-2';
const OMAR_LATEST = 'omar-secret-pass-3';
const SALMA = { display_name: 'Salma', username: 'salma', password: 'salma-secret-pass-1', role: 'learner', mobile: '01033334444' };
const OMAR_CORRECTED_MOBILE = '01077778888';
// Release 2 (R2-a, AT-13c): a guardian, appointed with her own mobile number.
const MONA = { display_name: 'Mona', username: 'mona.guardian', password: 'mona-secret-pass-1', role: 'guardian', mobile: '0104 141 4141' };
// Release 2 (R2-b, AT-13c): a publisher, and the marks she enters (section 3: no mark and no learner name in a log line).
const HODA = { display_name: 'Hoda', username: 'hoda.teacher', password: 'hoda-secret-pass-1', role: 'publisher' as const, mobile: '01020202020' };
const MARKS = ['13.5', '16.5'];
// Release 2 (R2-c, AT-13c): a correction of Omar's mark, and its reason.
const CORRECTED = '17.5';
const REASON = 'Omar question 3 re-marked';

/** Every written form of a full mobile number (typed with or without spaces, national, international, digits only). */
function mobileForms(typed: string, countryCode = '+20'): string[] {
  const digits = typed.replace(/\D/g, '');
  const national = digits.replace(/^0/, '');
  return [typed, digits, national, `${countryCode}${national}`, `${countryCode.slice(1)}${national}`];
}

/** Every secret found in the lines: [secret's name, line]. */
export function secretsIn(lines: string[], secrets: Map<string, string>): [string, string][] {
  const hits: [string, string][] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const [name, value] of secrets) if (value && lower.includes(value.toLowerCase())) hits.push([name, line]);
  }
  return hits;
}

const cookieToken = (c: Client) =>
  c.lastSetCookie.map((l) => l.match(/^lms_session=([^;]+)/)?.[1]).find((v): v is string => Boolean(v)) ?? '';

describe('no-secrets guard, part 3: no line the running product writes holds a secret', { concurrency: false }, () => {
  let w: InProcessWorker;
  const secrets = new Map<string, string>();
  const keep = async (name: string, token: string) => {
    assert.ok(token, `${name} was captured`);
    secrets.set(name, token);
    secrets.set(`${name} (stored id)`, await tokenHash(token));
  };
  let lines: string[] = [];

  before(async () => {
    w = await startInProcess({ PASSWORD_ITERATIONS: '10000' });
    for (const [n, v] of [['owner password', OWNER.password], ['admin password', ADMIN.password], ['Omar password', OMAR.password],
      ['Omar new password', OMAR_NEW], ['Omar latest password', OMAR_LATEST], ['Salma password', SALMA.password], ['Mona password', MONA.password],
      ['Hoda password', HODA.password], ['a mark', MARKS[0]], ['another mark', MARKS[1]], ['a learner name', OMAR.display_name], ['another learner name', SALMA.display_name],
      ['a corrected mark', CORRECTED], ['a correction reason', REASON]]) secrets.set(n, v);
    for (const [n, m] of [['owner mobile', OWNER.mobile], ['admin mobile', ADMIN.mobile], ['Omar mobile', OMAR.mobile], ['Salma mobile', SALMA.mobile], ['Omar corrected mobile', OMAR_CORRECTED_MOBILE], ['Mona mobile', MONA.mobile], ['Hoda mobile', HODA.mobile]]) {
      mobileForms(m).forEach((f, i) => secrets.set(`${n} (form ${i})`, f));
    }
    // A database failure whose message repeats the statement's values (and the reset link's address).
    let failNext: { match: RegExp; extra: string } | null = null;
    w.setHooks({
      rewrite(sql, params) {
        if (failNext && failNext.match.test(sql)) {
          const extra = failNext.extra;
          failNext = null;
          throw new Error(`D1_ERROR: ${sql.slice(0, 60)} failed for ${JSON.stringify(params)}${extra}`);
        }
        return [sql, params];
      },
    });
    const fail = (match: RegExp, extra = '') => void (failNext = { match, extra });

    // Owner setup: password, mobile, recovery code, session.
    const owner = new Client(w.url);
    const setup = await owner.post('/setup', OWNER);
    assert.equal(setup.status, 200, 'owner setup');
    secrets.set('recovery code', (await setup.text()).match(/id="recovery-code"[^>]*>([^<]+)</)?.[1] ?? '');
    assert.ok(secrets.get('recovery code'), 'recovery code captured');
    await keep('owner session', cookieToken(owner));
    const spaceId = await createSpace(owner, { name: 'Mesk School', kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    const admin = await signedIn(w.url, ADMIN.username, ADMIN.password);
    await keep('admin session', cookieToken(admin));
    assert.equal((await admin.post(`/s/${spaceId}/admin/people`, { ...OMAR, valid_until: utcDatePlusDays(30) })).status, 303, 'Omar appointed');
    const omarId = String((w.sqlite.prepare('SELECT id FROM user WHERE username = ?').get(OMAR.username) as { id: string }).id);
    const omarPath = `/s/${spaceId}/admin/people/${omarId}`;

    assert.equal((await admin.post(`/s/${spaceId}/admin/people`, { ...SALMA, valid_until: utcDatePlusDays(30) })).status, 303, 'Salma appointed');

    // Release 2 (R2-a, AT-13c): the guardian pages and their statements are in the run. Mona is
    // appointed with her mobile number and linked to Omar (the first try fails on the link row, with
    // its values and her number in the message), signs in, and opens her guardian pages (one fails
    // on the statement that reads her links).
    assert.equal((await admin.post(`/s/${spaceId}/admin/people`, { ...MONA, valid_until: utcDatePlusDays(30) })).status, 303, 'Mona appointed');
    const monaId = String((w.sqlite.prepare('SELECT id FROM user WHERE username = ?').get(MONA.username) as { id: string }).id);
    fail(/^\s*INSERT INTO guardian_link/, ` for ${MONA.display_name} ${MONA.mobile}`);
    assert.equal((await admin.post(`/s/${spaceId}/admin/people/${monaId}/links`, { learner: omarId })).status, 500, 'forced failure on the link row');
    assert.equal((await admin.post(`/s/${spaceId}/admin/people/${monaId}/links`, { learner: omarId })).status, 303, 'Mona linked to Omar');
    const mona = await signedIn(w.url, MONA.username, MONA.password);
    await keep('Mona session', cookieToken(mona));
    assert.equal((await mona.get(`/s/${spaceId}/linked`)).status, 200, 'the guardian home');
    fail(/FROM guardian_link gl\s+JOIN membership/);
    assert.equal((await mona.get(`/s/${spaceId}/linked/${omarId}`)).status, 500, 'forced failure on the guardian page');
    assert.equal((await mona.get(`/s/${spaceId}/linked/${omarId}`)).status, 200, 'the learner page');

    // Release 2 (R2-b, AT-13c): marks. A publisher makes an exam of a subject Omar and Salma read, saves
    // a draft and publishes it, and Omar opens his results. The draft save fails once on the row that
    // carries a mark (its values and the learner's name in the message), the publish batch fails once on
    // a history row, and My results fails once on its read. No mark and no learner name may reach a line.
    const salmaId = String((w.sqlite.prepare('SELECT id FROM user WHERE username = ?').get(SALMA.username) as { id: string }).id);
    const seeded = await seed(w.url, {
      spaceId, grantedBy: ADMIN.username,
      people: [{ ...HODA, valid_until: utcDatePlusDays(30) }],
      subjects: [{ title: 'Mathematics', publisher: HODA.username, published: true, users: [OMAR.username, SALMA.username] }],
    });
    const hoda = await signedIn(w.url, HODA.username, HODA.password);
    await keep('Hoda session', cookieToken(hoda));
    const made = await hoda.post(`/s/${spaceId}/publish/edit/${seeded.subjects.Mathematics.id}/marks`, { title: 'Mid-term', exam_date: '2026-11-12', max_mark: '20' });
    assert.equal(made.status, 303, 'the exam is made');
    const marks = (made.headers.get('location') ?? '').replace(/^https?:\/\/[^/]+/, '');
    const form = (action: string) => {
      const f = new FormData();
      for (const [id, mark] of [[omarId, MARKS[0]], [salmaId, MARKS[1]]]) {
        f.append('learner', id);
        f.set(`mark:${id}`, mark);
      }
      f.set('action', action);
      return f;
    };
    fail(/^\s*INSERT INTO exam_result \(/, ` for ${OMAR.display_name} ${SALMA.display_name} marks ${MARKS.join(' ')}`);
    assert.equal((await hoda.post(marks, form('draft'))).status, 500, 'forced failure on the draft row with a mark');
    assert.equal((await hoda.post(marks, form('draft'))).status, 303, 'the draft is saved');
    const step = await hoda.post(marks, form('publish'));
    assert.equal(step.status, 200, 'the confirmation');
    const confirm = new FormData();
    const page = await step.text();
    for (const m of page.matchAll(/<form id="confirm"[\s\S]*?<\/form>/g)) {
      for (const l of m[0].matchAll(/name="learner" value="([^"]+)"/g)) confirm.append('learner', l[1]);
      confirm.set('version', m[0].match(/name="version" value="([^"]+)"/)?.[1] ?? '');
    }
    fail(/^\s*INSERT INTO exam_result_history/, ` for ${OMAR.display_name} new mark ${MARKS[0]}`);
    assert.equal((await hoda.post(`${marks}/publish`, confirm)).status, 500, 'forced failure in the publish batch');
    assert.equal((await hoda.post(`${marks}/publish`, confirm)).status, 303, 'published');
    const omarReads = await signedIn(w.url, OMAR.username, OMAR.password);
    fail(/FROM exam_result r JOIN exam e/, ` for ${OMAR.display_name} ${MARKS[0]}`);
    assert.equal((await omarReads.get(`/s/${spaceId}/results`)).status, 500, 'forced failure on My results');
    const results = await omarReads.get(`/s/${spaceId}/results`);
    assert.equal(results.status, 200, 'My results');
    assert.ok((await results.text()).includes(`${MARKS[0]} / 20`), 'Omar reads his own mark');

    // Release 2 (R2-c, AT-13c): results views and corrections. Hoda corrects Omar's mark with a
    // reason; the correction batch fails once on its history row (the learner's name, both marks and
    // the reason in the message). Mona reads Omar's results on her guardian page and the admin reads
    // the exam's rows, each failing once on its read. No mark, name or reason may reach a line.
    const examPath = marks;
    const correctionPage = await (await hoda.get(`${examPath}/correct?learner=${omarId}`)).text();
    const version = correctionPage.match(/<form id="correct"[\s\S]*?name="version" value="([^"]*)"/)?.[1] ?? '';
    const correction = { learner: omarId, mark: CORRECTED, reason: REASON, version };
    fail(/^\s*INSERT INTO exam_result_history/, ` for ${OMAR.display_name} ${MARKS[0]} -> ${CORRECTED} because ${REASON}`);
    assert.equal((await hoda.post(`${examPath}/correct`, correction)).status, 500, 'forced failure in the correction batch');
    assert.equal((await hoda.post(`${examPath}/correct`, correction)).status, 303, 'corrected');
    fail(/FROM exam_result r JOIN exam e/, ` for ${OMAR.display_name} ${CORRECTED}`);
    assert.equal((await mona.get(`/s/${spaceId}/linked/${omarId}`)).status, 500, 'forced failure on the guardian\'s results');
    const monaReads = await mona.get(`/s/${spaceId}/linked/${omarId}`);
    assert.ok((await monaReads.text()).includes(`${CORRECTED} / 20`), 'Mona reads Omar\'s corrected mark');
    const examId = examPath.split('/').pop();
    fail(/FROM exam_result r JOIN exam e/, ` for ${OMAR.display_name} ${CORRECTED} ${REASON}`);
    assert.equal((await admin.get(`/s/${spaceId}/admin/results/${examId}`)).status, 500, 'forced failure on the admin\'s results');
    assert.equal((await admin.get(`/s/${spaceId}/admin/results/${examId}`)).status, 200, 'the admin reads the rows');

    // Forced failure: correcting Omar's mobile number fails on the row that carries the new number.
    fail(/^\s*UPDATE user SET display_name = \?, mobile = \?/);
    const corrected = await admin.post(`${omarPath}/correct`, { display_name: OMAR.display_name, mobile: OMAR_CORRECTED_MOBILE, valid_until: utcDatePlusDays(30) });
    assert.equal(corrected.status, 500, 'forced failure on the mobile number');

    // Sign-in: a wrong password, then the right one.
    assert.equal((await new Client(w.url).post('/signin', { username: OMAR.username, password: 'not-his-password' })).status, 401);
    const omar = await signedIn(w.url, OMAR.username, OMAR.password);
    await keep('Omar session', cookieToken(omar));

    // A reset link: opened, refused for a wrong username, used.
    const link = await issueLink(admin, omarPath);
    assert.equal(link.status, 200, 'reset link issued');
    await keep('reset token', link.token);
    const visitor = new Client(w.url);
    assert.equal((await visitor.get(`/r/${link.token}`)).status, 200);
    assert.equal((await visitor.post(`/r/${link.token}`, { username: 'not-omar', new_password: OMAR_NEW })).status, 401);
    assert.equal((await visitor.post(`/r/${link.token}`, { username: OMAR.username, new_password: OMAR_NEW })).status, 200);
    assert.equal((await visitor.get(`/r/${link.token}`)).status, 410, 'a used link is dead');

    // Forced failure: a second link fails on the statement that looks up the token, with the address in the message.
    const second = await issueLink(admin, omarPath);
    await keep('second reset token', second.token);
    fail(/token_hash = \?/, ` while serving /r/${second.token}`);
    assert.equal((await new Client(w.url).get(`/r/${second.token}`)).status, 500, 'forced failure on the reset token');

    // The person's own password change.
    const again = await signedIn(w.url, OMAR.username, OMAR_NEW);
    await keep('Omar second session', cookieToken(again));
    assert.equal((await again.post('/account/password', { current_password: OMAR_NEW, new_password: OMAR_LATEST })).status, 200);

    // Forced failure: the session lookup, which carries the session id.
    fail(/FROM session s JOIN user u/);
    assert.equal((await again.get('/home')).status, 500, 'forced failure on the session id');

    // Forced failure: the usage counter's flush (at most once a minute; the clock moves two minutes on).
    fail(/INSERT INTO usage_day/);
    await fetch(w.url + '/__test/clock', { method: 'POST', headers: { 'content-type': 'application/json', origin: w.url }, body: JSON.stringify({ offsetMs: 120_000 }) });
    await new Client(w.url).get('/signin');
    await w.settle();
    await fetch(w.url + '/__test/clock', { method: 'POST', headers: { 'content-type': 'application/json', origin: w.url }, body: JSON.stringify({ offsetMs: 0 }) });

    // Every session id that was stored during the run.
    for (const row of w.sqlite.prepare('SELECT id FROM session').all() as { id: string }[]) secrets.set(`stored session ${row.id.slice(0, 6)}`, row.id);
    lines = w.log();
  });

  after(() => w?.stop());

  it('self-check: a planted line with any of these secrets is found', () => {
    const planted = [
      `reset link used ${w.url}/r/${secrets.get('reset token')}`,
      `sign-in ${OMAR.username} ${OMAR.password}`,
      `appointed with ${secrets.get('Omar mobile (form 3)')}`,
      `session ${secrets.get('Omar session (stored id)')}`,
    ];
    for (const line of planted) assert.ok(secretsIn([line], secrets).length, `planted: ${line}`);
  });

  it('the run made the product log (each forced failure wrote its line)', () => {
    const parsed = lines.flatMap((l) => (l.startsWith('{') ? [JSON.parse(l) as { event: string }] : []));
    assert.equal(parsed.filter((p) => p.event === 'request failed').length, 11, lines.join('\n'));
    assert.equal(parsed.filter((p) => p.event === 'usage flush failed').length, 1, lines.join('\n'));
  });

  it('every line is a known event, and none holds a password, a token, a full mobile number or a session id', () => {
    assert.deepEqual(secretsIn(lines, secrets), []);
    for (const l of lines) assert.ok(EVENTS.includes((JSON.parse(l) as { event: string }).event), l);
  });

  it('self-check: a Node runtime warning is not taken for a product line, and a console line still is', async () => {
    const before = w.log().length;
    process.emitWarning('log capture self-check');
    await new Promise((r) => setTimeout(r, 10));
    console.error('log capture self-check line');
    assert.deepEqual(w.log().slice(before), ['log capture self-check line']);
  });
});
