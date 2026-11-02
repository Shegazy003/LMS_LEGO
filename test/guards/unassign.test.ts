// AT-7 guard: unassigning takes effect on every direct link (release 1.1,
// contract 0.2, AT-7; docs/02-LEGO-MODEL.md rule 6, visibility follows
// assignment).
//
// Against the running Worker (Wrangler + workerd, local D1 and R2), through the
// admin's real forms, checking status codes, response headers and stored rows,
// with the sessions the learners already had (no new sign-in):
// - A learner removed from a group loses every subject that reached her only
//   through that group, at once, on every direct link: the subject, the
//   lesson, and every file, even when her browser asks with the file's ETag
//   (If-None-Match), which must not answer 304. The subject leaves her home.
// - A group unassigned from a subject: every member loses that subject on
//   every direct link; a member who is also assigned the subject directly
//   keeps it; the group's other subjects stay.
// - Re-adding restores access with the same content: no chapter, lesson,
//   material or file is changed by any of this, and the publisher keeps her
//   editor throughout.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, setClockOffsetMs, setStartOffset, tinyPng, workerNow } from '../support/http.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf } from '../support/seed.ts';
import { changes, sha256, snapshot, type Snapshot } from '../support/state.ts';

const SPACE = 'مدرسة مسك';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const HADEER = { username: 'hadeer', password: 'hadeer-first-pass', display_name: 'Hadeer', mobile: '01022223333', role: 'publisher' as const };
const SALMA = { username: 'salma.learner', password: 'salma-first-pass', display_name: 'Salma Adel', mobile: '01033334444', role: 'learner' as const };
const OMAR = { username: 'omar.learner', password: 'omar-first-pass', display_name: 'Omar Nabil', mobile: '01055556666', role: 'learner' as const };
const DAY = 86_400_000;
const PDF = tinyPdf('Adding fractions');
const PNG = tinyPng();
const STORY = tinyPdf('First story');
const CONTENT_TABLES = ['subject', 'chapter', 'lesson', 'material'];

let worker: RunningWorker;
let admin: Client;
let hadeer: Client;
let salma: Client;
let omar: Client;
let spaceId = '';
let today = '';
let start: Snapshot;
const ids: Record<string, string> = {};
const c: Record<string, string> = {};

const plus = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const textOf = (html: string) => html.replace(/<[^>]*>/g, '');

/** Every direct link of a subject: the subject, its lesson, each of its files. */
const mathLinks = () => [`/s/${spaceId}/learn/${c.math}`, `/s/${spaceId}/read/${c.mathLesson}`, `/s/${spaceId}/file/${c.mathPdf}`, `/s/${spaceId}/file/${c.mathPng}`];
const readingLinks = () => [`/s/${spaceId}/learn/${c.reading}`, `/s/${spaceId}/read/${c.readingLesson}`, `/s/${spaceId}/file/${c.readingPdf}`];

async function homeText(who: Client): Promise<string> {
  const res = await who.get(`/s/${spaceId}`);
  assert.equal(res.status, 200, 'the home opens');
  return textOf(await res.text());
}

/** Each link answers 403, with no file bytes, whether or not the browser offers a cached copy's ETag. */
async function assertRefused(who: Client, links: string[], etags: Record<string, string>, where: string): Promise<void> {
  for (const path of links) {
    const plain = await who.get(path);
    assert.equal(plain.status, 403, `${where}: ${path} refused (got ${plain.status})`);
    assert.ok(!/pdf|image/.test(plain.headers.get('content-type') ?? ''), `${where}: ${path} sends no file`);
    if (etags[path]) {
      const cached = await who.getWith(path, { 'if-none-match': etags[path] });
      assert.equal(cached.status, 403, `${where}: ${path} with the cached copy's ETag is refused, not 304 (got ${cached.status})`);
    }
  }
}

/** Each link opens; returns the ETag of every file, as a browser would keep it. */
async function assertOpen(who: Client, links: string[], where: string): Promise<Record<string, string>> {
  const etags: Record<string, string> = {};
  for (const path of links) {
    const res = await who.get(path);
    assert.equal(res.status, 200, `${where}: ${path} opens (got ${res.status})`);
    if (path.includes('/file/')) {
      assert.match(res.headers.get('cache-control') ?? '', /no-cache/, `${where}: ${path} is revalidated on every use`);
      const etag = res.headers.get('etag') ?? '';
      assert.ok(etag, `${where}: ${path} has an ETag`);
      etags[path] = etag;
      const cached = await who.getWith(path, { 'if-none-match': etag });
      assert.equal(cached.status, 304, `${where}: positive control, ${path} with its ETag answers 304 while access lasts`);
    }
    await res.arrayBuffer();
  }
  return etags;
}

async function members(groupId: string): Promise<string[]> {
  return (await worker.sql(`SELECT user_id FROM group_member WHERE group_id = '${groupId}' AND space_id = '${spaceId}'`)).map((r) => String(r.user_id)).sort();
}

/** The admin saves a group's members through the group's form. */
async function saveMembers(groupId: string, userIds: string[]): Promise<void> {
  const form = new URLSearchParams();
  for (const id of userIds) form.append('member', id);
  const res = await admin.postBody(`/s/${spaceId}/admin/sets/${groupId}`, form.toString(), {
    'content-type': 'application/x-www-form-urlencoded', origin: worker.url,
  });
  assert.equal(res.status, 303, 'the group is saved');
}

/** The admin saves a subject's readers through the subject's form (the publisher stays Hadeer). */
async function saveReaders(subjectId: string, v: { sets: string[]; learners: string[] }): Promise<void> {
  const form = new URLSearchParams({ publisher: ids[HADEER.username] });
  for (const id of v.sets) form.append('set', id);
  for (const id of v.learners) form.append('learner', id);
  const res = await admin.postBody(`/s/${spaceId}/admin/topics/${subjectId}`, form.toString(), {
    'content-type': 'application/x-www-form-urlencoded', origin: worker.url,
  });
  assert.equal(res.status, 303, 'the subject\'s readers are saved');
}

async function assertContentUntouched(where: string): Promise<void> {
  const now = await snapshot(worker);
  for (const table of CONTENT_TABLES) assert.deepEqual(now[table], start[table], `${where}: no ${table} row changed`);
  assert.equal((await hadeer.get(`/s/${spaceId}/publish/edit/${c.math}`)).status, 200, `${where}: the publisher keeps her editor`);
  assert.equal((await hadeer.get(`/s/${spaceId}/publish/edit/${c.reading}`)).status, 200, `${where}: and her other subject`);
}

describe('AT-7 guard: unassigning takes effect on every direct link', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker();
    today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    setStartOffset(worker.url, Date.parse(`${today}T12:00:00Z`) - Date.now());
    assert.equal((await setClockOffsetMs(worker.url, 0)).status, 200);
    const owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: plus(60) });
    const s = await seed(worker.url, {
      spaceId,
      grantedBy: ADMIN.username,
      people: [HADEER, SALMA, OMAR].map((p) => ({ ...p, valid_until: plus(30) })),
      groups: [{ name: 'Science', members: [SALMA.username, OMAR.username] }],
      subjects: [
        {
          title: 'Mathematics', publisher: HADEER.username, published: true, groups: ['Science'],
          chapters: [{ title: 'Fractions', lessons: [{ title: 'Adding fractions', materials: [
            { kind: 'pdf', title: 'Worksheet', base64: b64(PDF), contentType: 'application/pdf' },
            { kind: 'image', title: 'Pizza', base64: b64(PNG), contentType: 'image/png' },
          ] }] }],
        },
        {
          // Omar is also assigned Reading directly.
          title: 'Reading', publisher: HADEER.username, published: true, groups: ['Science'], users: [OMAR.username],
          chapters: [{ title: 'Stories', lessons: [{ title: 'First story', materials: [
            { kind: 'pdf', title: 'Story sheet', base64: b64(STORY), contentType: 'application/pdf' },
          ] }] }],
        },
      ],
    });
    Object.assign(ids, s.users, { science: s.groups.Science });
    const math = s.subjects.Mathematics.chapters.Fractions.lessons['Adding fractions'];
    const reading = s.subjects.Reading.chapters.Stories.lessons['First story'];
    Object.assign(c, {
      math: s.subjects.Mathematics.id, mathLesson: math.id, mathPdf: math.materials.Worksheet, mathPng: math.materials.Pizza,
      reading: s.subjects.Reading.id, readingLesson: reading.id, readingPdf: reading.materials['Story sheet'],
    });
    admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    hadeer = await signedIn(worker.url, HADEER.username, HADEER.password);
    salma = await signedIn(worker.url, SALMA.username, SALMA.password);
    omar = await signedIn(worker.url, OMAR.username, OMAR.password);
    start = await snapshot(worker);
  });

  after(async () => {
    if (worker) await setClockOffsetMs(worker.url, 0).catch(() => undefined);
    await worker?.stop();
  });

  it('a learner removed from a group loses its subjects at once on every direct link, a cached file\'s ETag included, with the sign-in she already had; re-added, she has them again', async () => {
    const etags = { ...(await assertOpen(salma, mathLinks(), 'before')), ...(await assertOpen(salma, readingLinks(), 'before')) };
    assert.ok((await homeText(salma)).includes('Mathematics'), 'positive control: her home lists the subject');

    await saveMembers(ids.science, [ids[OMAR.username]]);
    assert.deepEqual(await members(ids.science), [ids[OMAR.username]], 'she is no longer a member');
    await assertRefused(salma, [...mathLinks(), ...readingLinks()], etags, 'the removed learner');
    const home = await homeText(salma);
    assert.ok(!home.includes('Mathematics') && !home.includes('Reading'), 'her home lists neither subject');
    await assertOpen(omar, [...mathLinks(), ...readingLinks()], 'the learner still in the group');
    await assertContentUntouched('after removing the learner');

    await saveMembers(ids.science, [ids[SALMA.username], ids[OMAR.username]]);
    await assertOpen(salma, [...mathLinks(), ...readingLinks()], 're-added');
    const bytes = await salma.get(`/s/${spaceId}/file/${c.mathPdf}`);
    assert.equal(sha256(new Uint8Array(await bytes.arrayBuffer())), sha256(PDF), 'the same file bytes');
    assert.deepEqual((await snapshot(worker)).group_member, start.group_member, 'exactly the members of the start');
  });

  it('a group unassigned from a subject: every member loses it on every direct link, a member assigned directly keeps it, and the group\'s other subjects stay', async () => {
    const etags = await assertOpen(salma, readingLinks(), 'before');
    const before = await snapshot(worker);
    await saveReaders(c.reading, { sets: [], learners: [ids[OMAR.username]] });
    const diff = changes(before, await snapshot(worker));
    assert.deepEqual(Object.keys(diff), ['subject_access'], 'only the assignment changed');
    assert.ok(diff.subject_access.removed.some((r) => JSON.parse(r).group_id === ids.science), 'the group\'s assignment is gone');

    await assertRefused(salma, readingLinks(), etags, 'a member of the unassigned group');
    assert.ok(!(await homeText(salma)).includes('Reading'), 'it left her home');
    await assertOpen(salma, mathLinks(), 'the group\'s other subject');
    await assertOpen(omar, readingLinks(), 'a member also assigned directly keeps it');

    // Unassigning the group from its last subject too: both members lose it.
    const mathEtags = { ...(await assertOpen(salma, mathLinks(), 'before')), ...(await assertOpen(omar, mathLinks(), 'before')) };
    await saveReaders(c.math, { sets: [], learners: [] });
    await assertRefused(salma, mathLinks(), mathEtags, 'Salma, after the group left the subject');
    await assertRefused(omar, mathLinks(), mathEtags, 'Omar, after the group left the subject');
    await assertContentUntouched('after unassigning');

    // Re-adding the group restores both, with nothing lost.
    await saveReaders(c.math, { sets: [ids.science], learners: [] });
    await saveReaders(c.reading, { sets: [ids.science], learners: [ids[OMAR.username]] });
    for (const who of [salma, omar]) await assertOpen(who, [...mathLinks(), ...readingLinks()], 'after re-adding the group');
    const reading = await omar.get(`/s/${spaceId}/file/${c.readingPdf}`);
    assert.equal(sha256(new Uint8Array(await reading.arrayBuffer())), sha256(STORY), 'the same file bytes');
    await assertContentUntouched('after re-adding');
  });

  it('a refused change of members or readers changes nobody\'s access', async () => {
    const before = await snapshot(worker);
    // An id that is not a learner of this space, and one that is not a group of it.
    const res1 = await admin.post(`/s/${spaceId}/admin/sets/${ids.science}`, { member: ids[HADEER.username] });
    assert.equal(res1.status, 400, 'a publisher cannot be made a group member');
    const res2 = await admin.post(`/s/${spaceId}/admin/topics/${c.math}`, { publisher: ids[HADEER.username], set: 'no-such-group' });
    assert.equal(res2.status, 400, 'an unknown group is refused');
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing changed');
    await assertOpen(salma, mathLinks(), 'access unchanged');
  });
});
