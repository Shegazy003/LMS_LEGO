// LMS wave 8 (product-contract v2 on PIL-299, section 6, N1 and B1): one
// comparison rule. Two responses are identical when their status, body and
// headers are equal byte for byte after the same replacements on both sides:
// the values of Date and Set-Cookie (and any CSP nonce or CSRF token, of which
// the product has none) become a fixed placeholder; for "identical to an id
// that does not exist", the requested id, wherever the response repeats it,
// becomes a fixed placeholder (the made-up id has the same length as a real
// one).
// The a41f7d8 capture: the world W8 (test/wave8/world.ts, fixed ids, the clock
// pinned with W6-c) is loaded on a41f7d8's code with a41f7d8's migrations (no
// wave 8 column, so no date: W8-0), and the request list below is sent in
// order, one request at a time, each person signed in on the router itself.
// The fixtures (test/wave8/fixtures/) keep, per response, the status, the
// normalised headers, and the length and SHA-256 of the normalised body; CI
// job wave-8 recaptures them from a41f7d8 and fails if they differ, then
// compares the candidate with them.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '../support/http.ts';
import { AMAL, AT8, HADEER, ID, MONA, OMAR, OWNER8, RANA, SALMA, w8World, type Person } from './world.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
/** The pinned base: a41f7d8 (main for W8-1a; CI checks it out into LMS_BASE_ROOT, default .base-w8/). */
export const BASE_SHA = 'a41f7d85b02f5dae353c28d5d8c2943098baa44b';
export const BASE_ROOT = process.env.LMS_BASE_ROOT ?? join(repo, '.base-w8');
export const FIXTURES = join(repo, 'test', 'wave8', 'fixtures');

/** A made-up id of the same length as a real one (N1). */
export const MADE_UP = { lesson: 'w8-less-0000-0000-0000-000000000099', file: 'w8-file-0000-0000-0000-000000000099' };
export const PLACEHOLDER = { date: '[date]', cookie: '[set-cookie]', id: '[made-up id]' };

export interface Request { who: Person; method: 'GET' | 'POST'; path: string; fields?: Record<string, string>; madeUp?: string }

const S = `/s/${ID.space}`;
/** Every surface of the 3.4 inventory, for Salma, Omar, Mona, Rana, the publisher's and the admin's preview and the owner (Arabic, the space's first language). */
export function requestList(): Request[] {
  const g = (who: Person, path: string, madeUp?: string): Request => ({ who, method: 'GET', path, madeUp });
  const done = (who: Person, lesson: string): Request => ({ who, method: 'POST', path: `${S}/read/${lesson}/done`, fields: { state: 'done' } });
  const lessons = [ID.l11, ID.l12, ID.l21, ID.l22, ID.l31, ID.l41, ID.l42];
  return [
    // Salma: home, subject, every lesson (each records an open), the file, made-up ids, quiz, results, a done mark, again.
    g(SALMA, S), g(SALMA, `${S}/learn/${ID.math}`), ...lessons.map((l) => g(SALMA, `${S}/read/${l}`)),
    g(SALMA, `${S}/file/${ID.pdf}`), g(SALMA, `${S}/read/${MADE_UP.lesson}`, MADE_UP.lesson), g(SALMA, `${S}/file/${MADE_UP.file}`, MADE_UP.file),
    g(SALMA, `${S}/quiz/${ID.quiz}`), g(SALMA, `${S}/results`),
    done(SALMA, ID.l11), g(SALMA, `${S}/read/${ID.l11}`), done(SALMA, ID.l21), g(SALMA, S), g(SALMA, `${S}/learn/${ID.math}`),
    // Omar: no marks; Ch2 and Ch3 lessons, done marks on them, the home after.
    g(OMAR, S), g(OMAR, `${S}/learn/${ID.math}`), g(OMAR, `${S}/read/${ID.l21}`), done(OMAR, ID.l21), g(OMAR, `${S}/read/${ID.l31}`), done(OMAR, ID.l31),
    g(OMAR, `${S}/file/${ID.pdf}`), g(OMAR, S),
    // Mona: guardian home, Salma's page (to-do block), Salma's activity page.
    g(MONA, S), g(MONA, `${S}/linked`), g(MONA, `${S}/linked/${SALMA.id}`), g(MONA, `${S}/linked/${SALMA.id}/activity`),
    // Rana: admin and learner: her home and subject, then the admin's preview.
    g(RANA, S), g(RANA, `${S}/learn/${ID.math}`), g(RANA, `${S}/read/${ID.l31}`),
    g(RANA, `${S}/preview`), g(RANA, `${S}/preview/learn/${ID.math}`), g(RANA, `${S}/preview/read/${ID.l21}`), g(RANA, `${S}/preview/read/${ID.l31}`),
    g(RANA, `${S}/preview/quiz/${ID.quiz}`), g(RANA, `${S}/preview/results`),
    // Amal (publisher) and Hadeer (admin): their previews.
    g(AMAL, `${S}/preview`), g(AMAL, `${S}/preview/learn/${ID.math}`), g(AMAL, `${S}/preview/read/${ID.l31}`),
    g(HADEER, `${S}/preview`), g(HADEER, `${S}/preview/learn/${ID.math}`), g(HADEER, `${S}/preview/read/${ID.l22}`),
    // The owner's kit preview (rule 6: no space content).
    g(OWNER8, `/owner/spaces/${ID.space}/preview`),
  ];
}

export interface Captured { n: number; who: string; method: string; path: string; status: number; headers: [string, string][]; bytes: number; sha256: string; body: Buffer }
export type Stored = Omit<Captured, 'body'>;

/** N1's replacements on one response (the same on both sides). */
export function normalise(res: Response, raw: Buffer, madeUp?: string): { headers: [string, string][]; body: Buffer } {
  const headers: [string, string][] = [];
  res.headers.forEach((value, name) => {
    if (name === 'set-cookie') return;
    headers.push([name, name === 'date' ? PLACEHOLDER.date : value]);
  });
  for (const _ of res.headers.getSetCookie()) headers.push(['set-cookie', PLACEHOLDER.cookie]);
  headers.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let body = raw;
  if (madeUp) {
    const text = raw.toString('latin1');
    if (text.includes(madeUp)) body = Buffer.from(text.split(madeUp).join(PLACEHOLDER.id), 'latin1');
    for (const h of headers) h[1] = h[1].split(madeUp).join(PLACEHOLDER.id);
  }
  return { headers, body };
}

/** Signs a person in on the router itself (no server between: the response headers are the product's only). */
async function signIn(url: string, who: Person): Promise<Client> {
  const c = new Client(url, { lang: null });
  const res = await c.post('/signin', { username: who.username, password: who.password });
  if (res.status !== 302) throw new Error(`${who.username} signs in (${res.status})`);
  return c;
}

/** The request list on a product already holding the world, its clock pinned (`url`: the router's own address). */
export async function captureOn(url: string, settle: () => Promise<void>): Promise<Captured[]> {
  const clients = new Map<string, Client>();
  for (const who of [SALMA, OMAR, MONA, RANA, AMAL, HADEER, OWNER8]) clients.set(who.key, await signIn(url, who));
  const out: Captured[] = [];
  let n = 0;
  for (const r of requestList()) {
    const c = clients.get(r.who.key)!;
    const res = r.method === 'GET' ? await c.get(r.path) : await c.post(r.path, r.fields ?? {});
    const raw = Buffer.from(await res.arrayBuffer());
    await settle();
    const { headers, body } = normalise(res, raw, r.madeUp);
    out.push({ n: ++n, who: r.who.key, method: r.method, path: r.path, status: res.status, headers, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), body });
  }
  return out;
}

/** The request list on one build and one world, the clock pinned at `atMs`. */
export async function capture(opts: { root?: string; dates: boolean; atMs: number; inOrder?: boolean }): Promise<Captured[]> {
  const w = await w8World({ root: opts.root, dates: opts.dates, atMs: opts.atMs, inOrder: opts.inOrder });
  try {
    return await captureOn(w.p.worker.url, () => w.p.worker.settle());
  } finally {
    await w.close();
  }
}

/** The clocks of the fixtures: before, the last instant before and the first instant of Ch2's and Ch5's day, Ch3's day, and 2027-01-01 (all passed). */
export const CLOCKS = { d9: AT8.d9, d9end: AT8.d9end, d10: AT8.d10, d17: AT8.d17, y2027: AT8.y2027 } as const;
export type ClockKey = keyof typeof CLOCKS;

const fixtureFile = (clock: ClockKey) => join(FIXTURES, `a41f7d8-w8-0-${clock}.json`);

export function readFixture(clock: ClockKey): Stored[] {
  const file = fixtureFile(clock);
  if (!existsSync(file)) throw new Error(`no fixture ${file}`);
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { base: string; clock: string; responses: Stored[] };
  if (doc.base !== BASE_SHA) throw new Error(`${file} is not a41f7d8's`);
  return doc.responses;
}

/** Writes one fixture from an a41f7d8 capture (the Builder's step; CI only recaptures and compares). */
export function writeFixture(clock: ClockKey, captured: Captured[]): void {
  mkdirSync(FIXTURES, { recursive: true });
  const responses = captured.map(({ body: _, ...rest }) => rest);
  writeFileSync(fixtureFile(clock), JSON.stringify({ base: BASE_SHA, world: 'W8-0', clock: new Date(CLOCKS[clock]).toISOString(), responses }, null, 1) + '\n');
}

/** The first differences between a capture and the stored responses (empty when identical by N1). */
export function differences(got: Captured[], stored: Stored[], live?: Captured[]): string[] {
  const out: string[] = [];
  if (got.length !== stored.length) out.push(`${got.length} responses, ${stored.length} stored`);
  for (let i = 0; i < Math.min(got.length, stored.length); i++) {
    const a = got[i];
    const b = stored[i];
    const what = `#${a.n} ${a.who} ${a.method} ${a.path}`;
    if (a.path !== b.path || a.who !== b.who) out.push(`${what}: the request list differs (${b.who} ${b.path})`);
    else if (a.status !== b.status) out.push(`${what}: status ${a.status}, stored ${b.status}`);
    else if (JSON.stringify(a.headers) !== JSON.stringify(b.headers)) out.push(`${what}: headers ${JSON.stringify(a.headers)}, stored ${JSON.stringify(b.headers)}`);
    else if (a.sha256 !== b.sha256 || a.bytes !== b.bytes) {
      let hint = '';
      const base = live?.[i];
      if (base && base.sha256 === b.sha256) {
        const x = base.body.toString('utf8');
        const y = a.body.toString('utf8');
        let k = 0;
        while (k < x.length && x[k] === y[k]) k++;
        hint = ` at ${k}:\n a41f7d8:   ${JSON.stringify(x.slice(Math.max(0, k - 100), k + 140))}\n candidate: ${JSON.stringify(y.slice(Math.max(0, k - 100), k + 140))}`;
      }
      out.push(`${what}: body ${a.bytes} bytes ${a.sha256.slice(0, 12)}, stored ${b.bytes} bytes ${b.sha256.slice(0, 12)}${hint}`);
    }
    if (out.length >= 8) break;
  }
  return out;
}
