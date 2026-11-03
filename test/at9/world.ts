// The made-up test space for release 2, task R2-a (contract product-contract-r2,
// section 3, "Test subjects"): Mesk School (مدرسة مسك) with its admin, the
// publishers Hadeer (Mathematics) and Shimaa (Arabic), the learners A and B
// (siblings), C and D who share the display name "Omar Test", and a second
// space with its own learner. Guardians G1 and G2 are appointed, and linked,
// through the admin's real forms when a test asks for it (AT-9a and 9b prove
// those forms in a browser).
//
// Seeded through the test route (src/test-hooks.ts), as earlier acceptance
// tests proved the admin and publisher screens make exactly these rows: the
// people other than the guardians, the group Science, and the subjects with
// their content. Physics is assigned to A and B but not published, so nobody
// may see it.
import assert from 'node:assert/strict';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf, type SeedPerson } from '../support/seed.ts';
import { startProduct, type Product } from '../support/product.ts';

export const SPACE = 'مدرسة مسك';
export const OTHER_SPACE = 'Delta Logistics';
export const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
export const OTHER_ADMIN = { display_name: 'Basem Fawzy', username: 'basem.admin', password: 'admin-other-pass', mobile: '01087654321' };

type Person = Omit<SeedPerson, 'valid_until'>;
export const HADEER: Person = { display_name: 'Hadeer', username: 'hadeer.t', password: 'hadeer-first-pass', role: 'publisher', mobile: '01022223333' };
export const SHIMAA: Person = { display_name: 'Shimaa', username: 'shimaa.t', password: 'shimaa-first-pass', role: 'publisher', mobile: '01066667777' };
export const A: Person = { display_name: 'Salma Test', username: 'salma.a', password: 'salma-first-pass', role: 'learner', mobile: '01031313131' };
export const B: Person = { display_name: 'Youssef Test', username: 'youssef.b', password: 'youssef-first-pass', role: 'learner', mobile: '01032323232' };
export const C: Person = { display_name: 'Omar Test', username: 'omar.c', password: 'omar-c-first-pass', role: 'learner', mobile: '01033333333' };
export const D: Person = { display_name: 'Omar Test', username: 'omar.d', password: 'omar-d-first-pass', role: 'learner', mobile: '01034343434' };
export const KARIM: Person = { display_name: 'Karim Said', username: 'karim.x', password: 'karim-first-pass', role: 'learner', mobile: '01055556666' };
export const G1 = { display_name: 'Mona Guardian', username: 'mona.g1', password: 'mona-first-pass', role: 'guardian', mobile: '01041414141' } as const;
export const G2 = { display_name: 'Hany Guardian', username: 'hany.g2', password: 'hany-first-pass', role: 'guardian', mobile: '01042424242' } as const;

/** Words that belong to lessons, files and the unpublished subject: none may reach a guardian page. */
export const CONTENT_WORDS = ['Fractions', 'Adding fractions', 'Worksheet', 'Pizza slices', 'A note only learners read', 'Physics', 'Motion', 'Nahw basics', 'Forklift'];

export interface World {
  p: Product;
  spaceId: string;
  otherSpaceId: string;
  owner: Client;
  admin: Client;
  /** Every person's user id, by username. */
  ids: Record<string, string>;
  content: { math: string; arabic: string; physics: string; lesson: string; pdf: string; note: string; otherLesson: string };
  adminEnd: string;
  close(): Promise<void>;
}

export const personPath = (w: World, userId: string) => `/s/${w.spaceId}/admin/people/${userId}`;

/** Appoints a guardian through the admin's real form (AT-9a); returns their user id. */
export async function appointGuardian(w: World, g: typeof G1 | typeof G2, validUntil = utcDatePlusDays(30)): Promise<string> {
  const res = await w.admin.post(`/s/${w.spaceId}/admin/people`, { ...g, valid_until: validUntil });
  assert.equal(res.status, 303, `${g.username} appointed (got ${res.status})`);
  const rows = await w.p.sql(`SELECT id FROM user WHERE username = '${g.username}'`);
  assert.equal(rows.length, 1);
  w.ids[g.username] = String(rows[0].id);
  return w.ids[g.username];
}

/** Links a guardian to a person through the admin's real form (AT-9b); returns the response. */
export function linkThrough(w: World, guardianId: string, learnerId: string, client = w.admin): Promise<Response> {
  return client.post(`${personPath(w, guardianId)}/links`, { learner: learnerId });
}

export async function buildWorld(opts: { guardians?: boolean; links?: boolean; extra?: Parameters<typeof seed>[1]['memberships'] } = {}): Promise<World> {
  const p = await startProduct();
  // A failed setup must stop the product, or its process keeps the test run alive.
  try {
    return await populate(p, opts);
  } catch (err) {
    await p.stop();
    throw err;
  }
}

async function populate(p: Product, opts: Parameters<typeof buildWorld>[0] & object): Promise<World> {
  const owner = await setUpOwner(p.url);
  const spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
  const otherSpaceId = await createSpace(owner, { name: OTHER_SPACE, kit: 'company', languages: 'en,ar' });
  const adminEnd = utcDatePlusDays(60);
  await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: adminEnd });
  await appointAdmin(owner, otherSpaceId, { ...OTHER_ADMIN, valid_until: adminEnd });
  const until = utcDatePlusDays(30);
  const s = await seed(p.url, {
    spaceId,
    grantedBy: ADMIN.username,
    people: [HADEER, SHIMAA, A, B, C, D].map((x) => ({ ...x, valid_until: until })),
    memberships: opts.extra,
    groups: [{ name: 'Science', members: [A.username, B.username, C.username] }],
    subjects: [
      {
        title: 'Mathematics', publisher: HADEER.username, published: true, groups: ['Science'],
        chapters: [{ title: 'Fractions', lessons: [{ title: 'Adding fractions', materials: [
          { kind: 'pdf', title: 'Worksheet', base64: b64(tinyPdf('Pizza slices')), contentType: 'application/pdf' },
          { kind: 'note', title: 'Note', text: 'A note only learners read' },
        ] }] }],
      },
      { title: 'Arabic', publisher: SHIMAA.username, published: true, users: [A.username], chapters: [{ title: 'Grammar', lessons: [{ title: 'Nahw basics' }] }] },
      { title: 'Physics', publisher: HADEER.username, published: false, users: [A.username, B.username], chapters: [{ title: 'Motion' }] },
    ],
  });
  const other = await seed(p.url, {
    spaceId: otherSpaceId,
    grantedBy: OTHER_ADMIN.username,
    people: [{ ...KARIM, valid_until: until }],
    subjects: [{ title: 'Forklift safety', published: true, users: [KARIM.username], chapters: [{ title: 'Dock', lessons: [{ title: 'Forklift rules' }] }] }],
  });
  const math = s.subjects.Mathematics;
  const lesson = math.chapters.Fractions.lessons['Adding fractions'];
  const admin = await signedIn(p.url, ADMIN.username, ADMIN.password);
  const ids: Record<string, string> = { ...s.users, ...other.users };
  for (const row of await p.sql(`SELECT id, username FROM user WHERE username IN ('${ADMIN.username}', '${OTHER_ADMIN.username}')`)) {
    ids[String(row.username)] = String(row.id);
  }
  const w: World = {
    p, spaceId, otherSpaceId, owner, admin, ids, adminEnd,
    content: {
      math: math.id, arabic: s.subjects.Arabic.id, physics: s.subjects.Physics.id, lesson: lesson.id,
      pdf: lesson.materials.Worksheet, note: lesson.materials.Note,
      otherLesson: other.subjects['Forklift safety'].chapters.Dock.lessons['Forklift rules'].id,
    },
    close: () => p.stop(),
  };
  if (opts.guardians || opts.links) {
    await appointGuardian(w, G1);
    await appointGuardian(w, G2);
  }
  if (opts.links) {
    for (const [g, l] of [[G1, A], [G1, B], [G2, A]] as const) {
      const res = await linkThrough(w, ids[g.username], ids[l.username]);
      assert.equal(res.status, 303, `${g.username} linked to ${l.username} (got ${res.status})`);
    }
  }
  return w;
}

/** A signed-in client for a person of the world. */
export const as = (w: World, person: { username: string; password: string }) => signedIn(w.p.url, person.username, person.password);
