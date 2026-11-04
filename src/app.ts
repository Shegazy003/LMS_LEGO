// LMS Lego router: server-rendered pages on Hono.
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, CurrentSpace } from './app-env.ts';
import { checkTypedEndDate, endedDate, isIsoDate, membershipStatus, utcDate } from './access.ts';
import {
  ADMIN_MANAGES, OWNER_MANAGES, appoint, correctPerson, createSet, createTopic, endAccess, findSet, findTopic, isAppointable, learnersOf,
  managedPerson, peopleOf, publishersOf, renameSet, renameTopic, restoreAccess, saveSetMembers, saveTopic, searchText, setPassword, setsOf,
  spaceAdmin, topicReaders, topicsOf, type ManagedRoles, type PersonRow,
} from './admin.ts';
import { attemptBlock, clearUser, minutesUntil, openDoor, recordFailure } from './auth/limits.ts';
import { dummyHash, hashPassword, passwordIterations, rehashIfNeeded, verifyPassword } from './auth/password.ts';
import { SESSION_COOKIE, SESSION_IDLE_MS, refreshSession, sessionDecision } from './auth/session.ts';
import { newRecoveryCode, randomToken, recoveryCodeHash, tokenHash } from './auth/tokens.ts';
import { now } from './clock.ts';
import { Db } from './db.ts';
import {
  LOGO_MAX_BYTES, MATERIAL_MAX_BYTES, fileHeaders, materialBodyTooLarge, materialFileHeaders, sniffLogo, sniffMaterial,
} from './files.ts';
import { LANGS, makeLabel, productLang, type Concept, type KitJson, type Label, type Lang, type LabelKey } from './labels.ts';
import { cleanDisplayName, cleanItemName, isUsername, typedUsername } from './names.ts';
import { readLabels, switchedKit } from './kits/edit.ts';
import {
  findFile, findLesson, lessonMaterials, outline, readableSubject, subjectsForLearner, subjectsForPublisher, type SubjectRow,
} from './learning.ts';
import { isGuardianHere, isLearnerHere, link, linkedLearner, linkedLearners, linksOf, subjectsSeenBy, unlink } from './guardians.ts';
import { activityOf, activitySetting, linkedSince, recordOpen, recordingSince, switchOff, switchOn } from './activity.ts';
import { adminActivityOffPage, adminActivityPage, guardianActivityPage, type AdminActivityView } from './views/activity.ts';
import { externalUrl } from './links.ts';
import { logError } from './log.ts';
import { normaliseCountryCode, normaliseMobile } from './phone.ts';
import {
  addChapter, addLesson, addMaterial, editableChapter, editableLesson, editableMaterial, editableSubject, isDirection,
  moveChapter, moveLesson, moveMaterial, renameChapter, renameLesson, renameMaterial, replacementKey, setPublished, switchFile,
  type EditableChapter, type EditableLesson, type EditableMaterial, type NewMaterial,
} from './publishing.ts';
import {
  ownedItem, recentlyRemoved, removeChapter, removeLesson, removeMaterial, removedLessonSubject, removedMaterialSubject,
  restoreChapter, restoreLesson, restoreMaterial, stillShowing, type ContentKind,
} from './removal.ts';
import { SEED_KITS, seedKit } from './kits/seed.ts';
import {
  countWrongUsername, findResetLink, issueResetLink, lastDigits, resetLinkState, resetMessage, useResetLink, whatsappHref,
  type FoundLink,
} from './reset.ts';
import { registerTestHooks } from './test-hooks.ts';
import { FREE_PLAN, UsageMeter, type FlushBatch } from './usage.ts';
import { accountPage, languagePage } from './views/account.ts';
import { peoplePage, setPage, setsPage, topicPage, topicsPage, type AppointForm, type ItemNotice } from './views/admin.ts';
import { recoverPage, recoveryCodePage, setupPage, signInPage } from './views/auth.ts';
import { layout, messagePage, type Html } from './views/layout.ts';
import { learnerHome, lessonPage, spacePage, subjectPage } from './views/learn.ts';
import {
  kitConfirmPage, newSpacePage, ownerHome, ownerSpacePage, type AdminRow, type AppointValues, type NewSpaceValues, type OwnerSpaceExtra,
} from './views/owner.ts';
import {
  confirmLinkPage, endConfirmPage, linkReadyPage, personPage, unlinkConfirmPage, type CorrectionValues, type LinksView, type PersonFrame,
  type PersonNotice, type PersonView,
} from './views/people.ts';
import { guardianHome, guardianLearnerPage, type LearnerCard } from './views/guardian.ts';
import {
  SEGMENT, chapterPage, lessonEditor, materialPage, publisherHome, removeConfirmPage, removedPage, subjectEditor, type EditorNotice,
} from './views/publish.ts';
import { resetAlreadyChangedPage, resetDeadPage, resetDonePage, resetPage, type ResetSpace } from './views/reset.ts';
import {
  REASON_MAX, adminResultsPage, confirmPage, correctionPage, examListPage, historyPage, marksMessagePage, marksPage, myResultsPage, resultPage,
  type ConfirmRowView, type HistoryRowView, type MarkCorrectionValues, type MarkRowView, type MarksNotice, type NewExamValues,
} from './views/exams.ts';
import {
  correctRow, createExam, editExam, editableExam, examOfSpace, examsOfSubject, examsWithResults, historyOfExam, isLocked, markText, ownResult,
  ownResults, publishRows, publishedRows, readMaxMark, readRow, resultsOfExam, rosterOf, saveDraft, secondIds,
  type DraftValue, type ExamRow, type ResultRow, type RosterRow,
} from './exams.ts';
import { accessEndedPage, adminHome, membershipsPage, type MembershipItem, type SpaceView } from './views/space.ts';
import { isSameOrigin } from './origin.ts';
import { logoKey, saveTheme, storedLogoKey } from './theme.ts';

type C = Context<AppEnv>;

const COLOUR = /^#[0-9a-fA-F]{6}$/;
const MIN_PASSWORD = 8;

// ---------------------------------------------------------------- usage ----
let meter: UsageMeter | null = null;
const getMeter = () => (meter ??= new UsageMeter(now()));

async function flushUsage(d1: D1Database, batch: FlushBatch): Promise<void> {
  try {
    const res = await d1
      .prepare(
        `INSERT INTO usage_day (day, requests, writes) VALUES (?, ?, ?)
         ON CONFLICT (day) DO UPDATE SET requests = requests + excluded.requests, writes = writes + excluded.writes`,
      )
      .bind(batch.day, batch.requests, batch.writes)
      .run();
    getMeter().recordWrites(res.meta.rows_written ?? 0, now()); // the flush is a write too
  } catch (err) {
    getMeter().restore(batch);
    logError('usage flush failed', err);
  }
}

async function storedBytes(bucket: R2Bucket): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    for (const obj of page.objects) total += obj.size;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return total;
}

// -------------------------------------------------------------- helpers ----
const label = (c: C, kit?: KitJson) => makeLabel(c.get('lang'), kit);

function page(c: C, body: Html, status: 200 | 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429 | 500 = 200) {
  c.header('cache-control', 'no-store');
  return c.html(body, status);
}

function refuse(c: C, status: 403 | 404, key: 'noAccess' | 'notFound' | 'setupClosed') {
  const t = label(c);
  return page(c, messagePage(t, c.get('lang'), t(key), Boolean(c.get('user'))), status);
}

const field = (body: Record<string, unknown>, name: string) => {
  const v = body[name];
  return typeof v === 'string' ? v.trim() : '';
};

async function ownerExists(db: Db): Promise<boolean> {
  return (await db.first('SELECT 1 AS one FROM user WHERE is_owner = 1')) !== null;
}

/** Starts a sign-in. Given the stored password hash a sign-in was checked
 * against, the session is written only if that hash is still the stored one,
 * in the same statement: a password changed since (a reset link, the admin,
 * the person's own change) wins, and the old password starts nothing
 * (hardening task H-1, test/guards/rehash-race.test.ts). Returns whether a
 * session was started. */
async function startSession(c: C, userId: string, checkedHash?: string): Promise<boolean> {
  const token = randomToken();
  const id = await tokenHash(token);
  const expires = now() + SESSION_IDLE_MS;
  const written = checkedHash === undefined
    ? await c.get('db').run('INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)', id, userId, expires)
    : await c.get('db').run(
      'INSERT INTO session (id, user_id, expires_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM user WHERE id = ? AND password_hash = ?)',
      id, userId, expires, userId, checkedHash,
    );
  if (written !== 1) return false;
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: new URL(c.req.url).protocol === 'https:',
    maxAge: SESSION_IDLE_MS / 1000,
  });
  return true;
}

function loadKit(json: string): KitJson {
  return JSON.parse(json) as KitJson;
}

/** The client's address as Cloudflare reports it (only used, hashed, by the rate limit). */
const clientAddress = (c: C) => c.req.header('cf-connecting-ip') ?? 'unknown';

/** Every value of a form field that may repeat (check boxes). */
function fieldList(body: Record<string, unknown>, name: string): string[] {
  const v = body[name];
  return (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && x !== '');
}

// ------------------------------------------------------------------ app ----
export const app = new Hono<AppEnv>();

// Middleware is registered only through use(), which also declares it here.
// The role guard (test/guards/role-gates.test.ts) treats every other route,
// whatever its shape, as a handler that must sit behind its role gate.
const middleware = new Set<unknown>();
export const MIDDLEWARE: ReadonlySet<unknown> = middleware;
function use<P extends string>(path: P, handler: MiddlewareHandler<AppEnv, P>): void {
  middleware.add(handler);
  app.use(path, handler);
}

// Count every request in memory; flush at most once a minute, after the response.
// The password strength (PASSWORD_ITERATIONS, src/auth/password.ts) is read
// first: a value outside the floor and ceiling refuses every request with a
// server error, logged with the reason, instead of hashing at a strength
// nobody chose.
use('*', async (c, next) => {
  c.set('iterations', passwordIterations(c.env.PASSWORD_ITERATIONS));
  const m = getMeter();
  m.recordRequest(now());
  c.set('db', new Db(c.env.DB, (rows) => m.recordWrites(rows, now())));
  c.set('lang', productLang(c.req.header('accept-language')));
  c.set('user', null);
  c.set('endedSignIn', null);
  await next();
  const batch = m.takeFlush(now());
  if (batch) c.executionCtx.waitUntil(flushUsage(c.env.DB, batch));
});

// Writes are accepted only from this site's own pages. A request that may
// change something (any method but GET, HEAD and OPTIONS), whatever its body
// type, must carry this site's own Origin, or a browser's same-origin
// Sec-Fetch-Site. This is Hono's csrf check without its exemption for bodies
// that are not forms, so a JSON or other body is held to the same rule; a
// request with no Origin at all is refused too (task 5, cross-origin guard).
const SAFE_METHOD = /^(GET|HEAD|OPTIONS)$/;
use('*', async (c, next) => {
  const sameOrigin = isSameOrigin(c.req.url, c.req.header('origin'), c.req.header('sec-fetch-site'));
  if (!SAFE_METHOD.test(c.req.method) && !sameOrigin) {
    throw new HTTPException(403, { res: new Response('Forbidden', { status: 403 }) });
  }
  await next();
});

// Server-side session from the HTTP-only cookie.
use('*', async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = c.get('db');
    const id = await tokenHash(token);
    const row = await db.first<{ expires_at: number; id: string; username: string; display_name: string; is_owner: number; lang: string | null }>(
      'SELECT s.expires_at, u.id, u.username, u.display_name, u.is_owner, u.lang FROM session s JOIN user u ON u.id = s.user_id WHERE s.id = ?',
      id,
    );
    const decision = row ? sessionDecision(row.expires_at, now()) : 'expired';
    if (row && decision !== 'expired') {
      // The refresh never revives a sign-in that End access stopped meanwhile (src/auth/session.ts).
      if (decision === 'refresh') await refreshSession(db, id, now() + SESSION_IDLE_MS);
      const lang = LANGS.find((l) => l === row.lang) ?? null;
      c.set('user', { id: row.id, username: row.username, display_name: row.display_name, is_owner: row.is_owner, sessionId: id, lang });
      // A person's own language choice (My account) also decides their pages outside any space.
      if (lang) c.set('lang', lang);
    } else {
      if (row) await db.run('DELETE FROM session WHERE id = ?', id);
      // A sign-in stopped by "End access now" (expiry 0, src/admin.ts) is over
      // with this request; the space's page may still say why, this once.
      if (row && Number(row.expires_at) === 0) c.set('endedSignIn', row.id);
      deleteCookie(c, SESSION_COOKIE, { path: '/' });
    }
  }
  await next();
});

if (__TEST_HOOKS__) registerTestHooks(app);

// ------------------------------------------------------- setup and auth ----
app.get('/', async (c) => {
  const user = c.get('user');
  if (user) return c.redirect(user.is_owner ? '/owner' : '/home');
  return c.redirect((await ownerExists(c.get('db'))) ? '/signin' : '/setup');
});

app.get('/setup', async (c) => {
  if (await ownerExists(c.get('db'))) return c.redirect('/signin');
  return page(c, setupPage(label(c), c.get('lang'), {}));
});

app.post('/setup', async (c) => {
  const db = c.get('db');
  if (await ownerExists(db)) return refuse(c, 403, 'setupClosed');
  const t = label(c);
  const body = await c.req.parseBody();
  const username = typedUsername(field(body, 'username'));
  const password = typeof body.password === 'string' ? body.password : '';
  const mobileInput = field(body, 'mobile');
  const mobile = normaliseMobile(mobileInput);
  const error = !isUsername(username)
    ? t('usernameInvalid')
    : password.length < MIN_PASSWORD
      ? t('passwordTooShort')
      : !mobile
        ? t('mobileNotInternational')
        : undefined;
  if (error || !mobile) return page(c, setupPage(t, c.get('lang'), { error, username, mobile: mobileInput }), 400);

  const id = crypto.randomUUID();
  const code = newRecoveryCode();
  try {
    await db.run(
      'INSERT INTO user (id, username, password_hash, display_name, mobile, is_owner, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      id, username, await hashPassword(password, c.get('iterations')), username, mobile, await recoveryCodeHash(code), now(),
    );
  } catch {
    return refuse(c, 403, 'setupClosed'); // a second owner, created in the same instant
  }
  await startSession(c, id);
  return page(c, recoveryCodePage(t, c.get('lang'), code));
});

app.get('/signin', (c) => {
  if (c.get('user')) return c.redirect('/');
  return page(c, signInPage(label(c), c.get('lang'), {}));
});

/** The plain message for a door that is refused for now (src/auth/limits.ts). */
const tooMany = (t: Label, until: number) => t('tooManyAttempts', { minutes: String(minutesUntil(until, now())) });

// Sign-in is rate-limited per username and per client (src/auth/limits.ts):
// a refused attempt checks no password and writes nothing.
app.post('/signin', async (c) => {
  const db = c.get('db');
  const t = label(c);
  const body = await c.req.parseBody();
  const username = typedUsername(field(body, 'username'));
  const password = typeof body.password === 'string' ? body.password : '';
  const door = await openDoor(db, username, clientAddress(c));
  const block = attemptBlock(door.rows, now());
  if (block) return page(c, signInPage(t, c.get('lang'), { error: tooMany(t, block.until), username }), 429);
  const user = await db.first<{ id: string; password_hash: string }>('SELECT id, password_hash FROM user WHERE username = ?', username);
  // An unknown username spends the same work, at the configured strength.
  const ok = await verifyPassword(password, user?.password_hash ?? (await dummyHash(c.get('iterations'))));
  if (!user || !ok) {
    await recordFailure(db, door, now());
    return page(c, signInPage(t, c.get('lang'), { error: t('signInFailed'), username }), 401);
  }
  await clearUser(db, door);
  // A hash made at another strength is re-written at the configured one (one
  // write, only then). If the password changed since it was checked, neither
  // the re-write nor the sign-in happens: the newer password wins.
  const standing = await rehashIfNeeded(db, user, password, c.get('iterations'));
  if (standing === null || !(await startSession(c, user.id, standing))) {
    return page(c, signInPage(t, c.get('lang'), { error: t('signInFailed'), username }), 401);
  }
  return c.redirect('/');
});

app.post('/signout', async (c) => {
  const user = c.get('user');
  if (user) await c.get('db').run('DELETE FROM session WHERE id = ?', user.sessionId);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.redirect('/signin');
});

app.get('/recover', (c) => page(c, recoverPage(label(c), c.get('lang'), {})));

app.post('/recover', async (c) => {
  const db = c.get('db');
  const t = label(c);
  const body = await c.req.parseBody();
  const username = typedUsername(field(body, 'username'));
  const code = field(body, 'code');
  const password = typeof body.password === 'string' ? body.password : '';
  const door = await openDoor(db, username, clientAddress(c));
  const block = attemptBlock(door.rows, now());
  if (block) return page(c, recoverPage(t, c.get('lang'), { error: tooMany(t, block.until), username }), 429);
  const oldHash = await recoveryCodeHash(code);
  const owner = await db.first<{ id: string }>(
    'SELECT id FROM user WHERE username = ? AND is_owner = 1 AND recovery_hash = ?',
    username, oldHash,
  );
  if (!owner) {
    await recordFailure(db, door, now());
    return page(c, recoverPage(t, c.get('lang'), { error: t('recoverFailed'), username }), 401);
  }
  await clearUser(db, door);
  if (password.length < MIN_PASSWORD) return page(c, recoverPage(t, c.get('lang'), { error: t('passwordTooShort'), username }), 400);

  const next = newRecoveryCode();
  const changed = await db.run(
    'UPDATE user SET password_hash = ?, recovery_hash = ? WHERE id = ? AND recovery_hash = ?',
    await hashPassword(password, c.get('iterations')), await recoveryCodeHash(next), owner.id, oldHash,
  );
  if (changed !== 1) return page(c, recoverPage(t, c.get('lang'), { error: t('recoverFailed'), username }), 401);
  await db.run('DELETE FROM session WHERE user_id = ?', owner.id); // every old sign-in ends
  await startSession(c, owner.id);
  return page(c, recoveryCodePage(t, c.get('lang'), next, true));
});

// ----------------------------------------------------------------- owner ----
const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) return c.redirect('/signin');
  if (!user.is_owner) return refuse(c, 403, 'noAccess');
  await next();
};
use('/owner', requireOwner);
use('/owner/*', requireOwner);

app.get('/owner', async (c) => {
  const db = c.get('db');
  const lang = c.get('lang');
  const rows = await db.all<{ id: string; name: string; json: string; admins: number }>(
    `SELECT s.id, s.name, k.json,
            (SELECT COUNT(*) FROM membership m WHERE m.space_id = s.id AND m.role = 'admin') AS admins
       FROM space s JOIN kit k ON k.id = s.kit_id ORDER BY s.created_at`,
  );
  const spaces = rows.map((r) => {
    const kit = loadKit(r.json);
    return { id: r.id, name: r.name, t: makeLabel(lang, kit), kitName: kit.name[lang], adminCount: r.admins };
  });
  const today = utcDate(now());
  const stored = await db.first<{ requests: number; writes: number }>('SELECT requests, writes FROM usage_day WHERE day = ?', today);
  const pending = getMeter().pending(today);
  const usage = [
    { kind: 'requests' as const, value: (stored?.requests ?? 0) + pending.requests, limit: FREE_PLAN.requestsPerDay },
    { kind: 'writes' as const, value: (stored?.writes ?? 0) + pending.writes, limit: FREE_PLAN.writesPerDay },
    { kind: 'storage' as const, value: await storedBytes(c.env.FILES), limit: FREE_PLAN.storageBytes },
  ];
  return page(c, ownerHome(label(c), lang, { spaces, usage }));
});

app.post('/owner/recovery-code', async (c) => {
  const code = newRecoveryCode();
  await c.get('db').run('UPDATE user SET recovery_hash = ? WHERE id = ? AND is_owner = 1', await recoveryCodeHash(code), c.get('user')!.id);
  return page(c, recoveryCodePage(label(c), c.get('lang'), code));
});

const kitChoices = (lang: Lang) => SEED_KITS.map((k) => ({ id: k.seed, name: k.name[lang] }));

app.get('/owner/spaces/new', (c) => page(c, newSpacePage(label(c), c.get('lang'), kitChoices(c.get('lang')), {})));

app.post('/owner/spaces', async (c) => {
  const db = c.get('db');
  const lang = c.get('lang');
  const t = label(c);
  const body = await c.req.parseBody();
  const values: NewSpaceValues = {
    name: field(body, 'name'),
    kit: field(body, 'kit'),
    languages: field(body, 'languages'),
    primary_color: field(body, 'primary_color'),
    country_code: field(body, 'country_code'),
  };
  const fail = (error: string) => page(c, newSpacePage(t, lang, kitChoices(lang), { ...values, error }), 400);

  const name = values.name ?? '';
  if (!name || name.length > 100) return fail(t('nameRequired'));
  if (!SEED_KITS.some((k) => k.seed === values.kit)) return fail(t('kitInvalid'));
  const languages = values.languages === 'ar,en' ? (['ar', 'en'] as Lang[]) : values.languages === 'en,ar' ? (['en', 'ar'] as Lang[]) : null;
  if (!languages) return fail(t('languagesInvalid'));
  if (!COLOUR.test(values.primary_color ?? '')) return fail(t('colorInvalid'));
  const countryCode = normaliseCountryCode(values.country_code ?? '');
  if (!countryCode) return fail(t('countryCodeInvalid'));

  let logo: { bytes: Uint8Array; type: string } | null = null;
  const file = body.logo;
  if (file instanceof File && file.size > 0) {
    if (file.size > LOGO_MAX_BYTES) return fail(t('logoTooLarge'));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffLogo(bytes);
    if (!type) return fail(t('logoType'));
    logo = { bytes, type };
  }

  const spaceId = crypto.randomUUID();
  const kitId = crypto.randomUUID();
  const kit = seedKit(values.kit!);
  kit.languages = languages;
  kit.theme = { ...kit.theme, primaryColor: values.primary_color!.toLowerCase(), logoKey: logo ? logoKey(spaceId) : null, logoType: logo?.type ?? null };
  if (logo) await c.env.FILES.put(logoKey(spaceId), logo.bytes, { httpMetadata: { contentType: logo.type } });
  try {
    await db.batch([
      ['INSERT INTO kit (id, name, json) VALUES (?, ?, ?)', kitId, kit.name.en, JSON.stringify(kit)],
      [
        'INSERT INTO space (id, name, kit_id, default_country_code, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        spaceId, name, kitId, countryCode, c.get('user')!.id, now(),
      ],
    ]);
  } catch (err) {
    if (logo) await c.env.FILES.delete(logoKey(spaceId));
    throw err;
  }
  return c.redirect(`/owner/spaces/${spaceId}`);
});

async function ownerSpace(c: C, spaceId: string) {
  const row = await c.get('db').first<{ id: string; name: string; default_country_code: string; kit_id: string; json: string }>(
    'SELECT s.id, s.name, s.default_country_code, s.kit_id, k.json FROM space s JOIN kit k ON k.id = s.kit_id WHERE s.id = ?',
    spaceId,
  );
  return row ? { id: row.id, name: row.name, countryCode: row.default_country_code, kitId: row.kit_id, kit: loadKit(row.json) } : null;
}

const OWNER_DONE = { kit: 'kitSwitched', labels: 'labelsSaved', theme: 'themeSaved' } as const;

async function renderOwnerSpace(c: C, spaceId: string, extra: OwnerSpaceExtra & { values?: AppointValues } = {}, status: 200 | 400 = 200) {
  const space = await ownerSpace(c, spaceId);
  if (!space) return refuse(c, 404, 'notFound');
  const done = c.req.method === 'GET' ? c.req.query('done') ?? '' : '';
  const doneKey = Object.hasOwn(OWNER_DONE, done) ? OWNER_DONE[done as keyof typeof OWNER_DONE] : undefined;
  const rows = await c.get('db').all<Omit<AdminRow, 'ended'> & { valid_from: string; ended_on: string | null }>(
    `SELECT u.id, u.username, u.display_name, u.mobile, m.valid_from, m.valid_until, m.ended_on
       FROM membership m JOIN user u ON u.id = m.user_id
      WHERE m.space_id = ? AND m.role = 'admin' ORDER BY u.username`,
    spaceId,
  );
  const admins: AdminRow[] = rows.map((a) => ({
    ...a, ended: membershipStatus(a.valid_from, a.valid_until, now(), a.ended_on) === 'ended' ? endedDate(a.valid_until, a.ended_on) : null,
  }));
  const t = makeLabel(c.get('lang'), space.kit);
  const body = ownerSpacePage(t, c.get('lang'), {
    space, admins, values: extra.values ?? {}, today: utcDate(now()), kits: kitChoices(c.get('lang')),
    errors: extra.errors, labelValues: extra.labelValues, done: doneKey && t(doneKey),
  });
  return page(c, body, status);
}

app.get('/owner/spaces/:id', (c) => renderOwnerSpace(c, c.req.param('id')));

app.post('/owner/spaces/:id/admins', async (c) => {
  const db = c.get('db');
  const spaceId = c.req.param('id');
  const space = await ownerSpace(c, spaceId);
  if (!space) return refuse(c, 404, 'notFound');
  const t = makeLabel(c.get('lang'), space.kit);
  const body = await c.req.parseBody();
  const values: AppointValues = {
    display_name: field(body, 'display_name'),
    username: field(body, 'username').toLowerCase(),
    mobile: field(body, 'mobile'),
    valid_until: field(body, 'valid_until'),
  };
  const password = typeof body.password === 'string' ? body.password : '';
  const mobile = normaliseMobile(values.mobile ?? '', space.countryCode);
  const displayName = cleanDisplayName(values.display_name ?? '');
  const today = utcDate(now());
  const error =
    !displayName
      ? t('displayNameInvalid')
      : !isUsername(values.username ?? '')
        ? t('usernameInvalid')
        : password.length < MIN_PASSWORD
          ? t('passwordTooShort')
          : !mobile
            ? t('mobileInvalid')
            : !isIsoDate(values.valid_until ?? '') || values.valid_until! < today
              ? t('endDateInvalid')
              : (await db.first('SELECT 1 AS one FROM user WHERE username = ?', values.username!))
                ? t('usernameTaken')
                : undefined;
  if (error || !mobile || !displayName) return renderOwnerSpace(c, spaceId, { errors: { appoint: error }, values }, 400);

  const userId = crypto.randomUUID();
  try {
    await db.batch([
      [
        'INSERT INTO user (id, username, password_hash, display_name, mobile, is_owner, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        userId, values.username!, await hashPassword(password, c.get('iterations')), displayName, mobile, now(),
      ],
      [
        'INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(), spaceId, userId, 'admin', today, values.valid_until!, c.get('user')!.id,
      ],
    ]);
  } catch {
    return renderOwnerSpace(c, spaceId, { errors: { appoint: t('usernameTaken') }, values }, 400); // taken in the same instant
  }
  return c.redirect(`/owner/spaces/${spaceId}`);
});

// The owner's kit editor (AT-5), on the owner's space page. Each form writes
// only this space's own kit row (src/kits/edit.ts), one statement each, and
// only the part it edits (json_set), so the three forms never overwrite each
// other: switching the kit (after a confirm step on the page) replaces the
// name and labels with a fresh copy of the chosen seed kit and keeps the
// languages and theme; the names form replaces the labels; the theme form
// replaces the colour and, when a file is sent, the logo.
app.post('/owner/spaces/:id/kit', async (c) => {
  const space = await ownerSpace(c, c.req.param('id'));
  if (!space) return refuse(c, 404, 'notFound');
  const t = makeLabel(c.get('lang'), space.kit);
  const body = await c.req.parseBody();
  const next = switchedKit(space.kit, field(body, 'kit'));
  if (!next) return renderOwnerSpace(c, space.id, { errors: { kit: t('kitInvalid') } }, 400);
  if (field(body, 'confirm') !== 'yes') {
    return page(c, kitConfirmPage(t, c.get('lang'), { space: { id: space.id, name: space.name }, kit: { id: next.seed, name: next.name[c.get('lang')] } }));
  }
  await c.get('db').run(
    `UPDATE kit SET name = ?, json = json_set(json, '$.seed', ?, '$.name', json(?), '$.labels', json(?), '$.gamification', json(?)) WHERE id = ?`,
    next.name.en, next.seed, JSON.stringify(next.name), JSON.stringify(next.labels), JSON.stringify(next.gamification), space.kitId,
  );
  return c.redirect(`/owner/spaces/${space.id}?done=kit#kit`, 303);
});

app.post('/owner/spaces/:id/labels', async (c) => {
  const space = await ownerSpace(c, c.req.param('id'));
  if (!space) return refuse(c, 404, 'notFound');
  const t = makeLabel(c.get('lang'), space.kit);
  const body = await c.req.parseBody();
  const read = readLabels(body, space.kit.languages);
  if (!read.ok) {
    const labelValues = Object.fromEntries(Object.entries(body).filter((e): e is [string, string] => typeof e[1] === 'string'));
    return renderOwnerSpace(c, space.id, { errors: { labels: t(read.error) }, labelValues }, 400);
  }
  await c.get('db').run(`UPDATE kit SET json = json_set(json, '$.labels', json(?)) WHERE id = ?`, JSON.stringify(read.labels), space.kitId);
  return c.redirect(`/owner/spaces/${space.id}?done=labels#labels`, 303);
});

app.post('/owner/spaces/:id/theme', async (c) => {
  const space = await ownerSpace(c, c.req.param('id'));
  if (!space) return refuse(c, 404, 'notFound');
  const t = makeLabel(c.get('lang'), space.kit);
  const body = await c.req.parseBody();
  const fail = (key: 'colorInvalid' | 'logoTooLarge' | 'logoType') => renderOwnerSpace(c, space.id, { errors: { theme: t(key) } }, 400);
  const colour = field(body, 'primary_color');
  if (!COLOUR.test(colour)) return fail('colorInvalid');
  const file = body.logo;
  let logo: { bytes: Uint8Array; type: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > LOGO_MAX_BYTES) return fail('logoTooLarge');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffLogo(bytes);
    if (!type) return fail('logoType');
    logo = { bytes, type };
  }
  const db = c.get('db');
  await saveTheme(
    { files: c.env.FILES, run: (sql, ...params) => db.run(sql, ...params) },
    { spaceId: space.id, kitId: space.kitId, colour, logo, currentLogoKey: space.kit.theme.logoKey },
  );
  return c.redirect(`/owner/spaces/${space.id}?done=theme#theme`, 303);
});

// Called only after the access check for the address has passed. The logo
// object is the one the space's kit points to (src/theme.ts).
async function serveLogo(c: C, spaceId: string, kitLogoKey: string | null) {
  const key = storedLogoKey(spaceId, kitLogoKey);
  const obj = key ? await c.env.FILES.get(key) : null;
  if (!obj) return refuse(c, 404, 'notFound');
  const headers = fileHeaders(obj.httpMetadata?.contentType ?? 'application/octet-stream', obj.httpEtag);
  if (c.req.header('if-none-match') === obj.httpEtag) {
    obj.body.cancel();
    return new Response(null, { status: 304, headers });
  }
  return new Response(obj.body, { headers });
}

app.get('/owner/spaces/:id/logo', async (c) => {
  const space = await ownerSpace(c, c.req.param('id'));
  if (!space) return refuse(c, 404, 'notFound');
  return serveLogo(c, space.id, space.kit.theme.logoKey);
});

// ---------------------------------------------------------------- spaces ----
app.get('/home', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/signin');
  if (user.is_owner) return c.redirect('/owner');
  const rows = await c.get('db').all<{ id: string; name: string; valid_from: string; valid_until: string; ended_on: string | null }>(
    `SELECT s.id, s.name, m.valid_from, m.valid_until, m.ended_on
       FROM membership m JOIN space s ON s.id = m.space_id WHERE m.user_id = ? ORDER BY s.name, s.id`,
    user.id,
  );
  // One entry per space. A space is marked ended (with the day it ended) when
  // every place the person has there has ended (AT-6 follow-up).
  const spaces: MembershipItem[] = [];
  for (const r of rows) {
    const ended = membershipStatus(r.valid_from, r.valid_until, now(), r.ended_on) === 'ended' ? endedDate(r.valid_until, r.ended_on) : null;
    const item = spaces.find((s) => s.id === r.id);
    if (!item) spaces.push({ id: r.id, name: r.name, endedOn: ended });
    else if (item.endedOn !== null) item.endedOn = ended === null ? null : ended > item.endedOn ? ended : item.endedOn;
  }
  if (spaces.length === 1) return c.redirect(`/s/${spaces[0].id}`);
  return page(c, membershipsPage(label(c), c.get('lang'), spaces));
});

// Every address inside a space passes this check first: signed in, a member
// of this space, and within its start and end dates. Before the start date
// every address answers 403 with "your access starts on"; after the end date,
// with the plain "access ended" message.
const ROLE_ORDER = ['admin', 'publisher', 'learner'];

use('/s/:spaceId/*', async (c, next) => {
  const user = c.get('user');
  // A sign-in that "End access now" stopped arrives here once more: if this
  // space is where access ended, its page says so; otherwise, sign in.
  const personId = user?.id ?? c.get('endedSignIn');
  if (!personId) return c.redirect('/signin');
  const spaceId = c.req.param('spaceId');
  const rows = await c.get('db').all<{ name: string; json: string; role: string; valid_from: string; valid_until: string; ended_on: string | null }>(
    `SELECT s.name, k.json, m.role, m.valid_from, m.valid_until, m.ended_on
       FROM membership m JOIN space s ON s.id = m.space_id JOIN kit k ON k.id = s.kit_id
      WHERE m.space_id = ? AND m.user_id = ?
      ORDER BY COALESCE(m.ended_on, m.valid_until) DESC`,
    spaceId, personId,
  );
  const status = (r: (typeof rows)[number]) => membershipStatus(r.valid_from, r.valid_until, now(), r.ended_on);
  if (!user && (!rows.length || rows.some((r) => status(r) !== 'ended'))) return c.redirect('/signin');
  if (!rows.length) return refuse(c, 403, 'noAccess');
  const kit = loadKit(rows[0].json);
  const [first, second] = kit.languages;
  const active = rows.filter((r) => status(r) === 'active');
  if (!active.length) {
    // A place that starts later is the one to tell about; otherwise the last that ended.
    const waiting = rows.filter((r) => status(r) === 'not-started').sort((x, y) => x.valid_from.localeCompare(y.valid_from))[0];
    const last = rows[0];
    const body = accessEndedPage(
      { t: makeLabel(first, kit), lang: first },
      second ? { t: makeLabel(second, kit), lang: second } : null,
      waiting
        ? { spaceName: waiting.name, date: waiting.valid_from, contactKey: 'admin', notStarted: true }
        : { spaceName: last.name, date: endedDate(last.valid_until, last.ended_on), contactKey: last.role === 'admin' ? 'ownerWord' : 'admin' },
      Boolean(user),
    );
    return page(c, body, 403);
  }
  if (!user) return c.redirect('/signin');
  const rank = (role: string) => (ROLE_ORDER.includes(role) ? ROLE_ORDER.indexOf(role) : ROLE_ORDER.length);
  const main = [...active].sort((x, y) => rank(x.role) - rank(y.role))[0];
  const space: CurrentSpace = {
    id: spaceId, name: main.name, kit, role: main.role, roles: active.map((r) => r.role), validUntil: main.valid_until,
  };
  c.set('space', space);
  // The person's own choice (My account) when this space offers it; otherwise the space's first language.
  const chosen = user.lang;
  c.set('lang', chosen && kit.languages.includes(chosen) ? chosen : first);
  await next();
});

// Role gates. Admin pages live under /s/<space>/admin, publisher pages under
// /s/<space>/publish. Anyone without that role today gets 403 with the plain
// refusal, before any page is looked up (so unknown addresses there are 403
// too, not 404).
const requireSpaceRole = (role: 'admin' | 'publisher' | 'guardian' | 'learner'): MiddlewareHandler<AppEnv> => async (c, next) => {
  if (!c.get('space').roles.includes(role)) return refuse(c, 403, 'noAccess');
  await next();
};
// A pattern ending in /* also matches its own base (…/admin itself).
use('/s/:spaceId/admin/*', requireSpaceRole('admin'));
use('/s/:spaceId/publish/*', requireSpaceRole('publisher'));
// Release 2 (R2-a): the guardian's pages live under /s/<space>/linked.
use('/s/:spaceId/linked/*', requireSpaceRole('guardian'));
// Release 2 (R2-b): a learner's own results live under /s/<space>/results.
use('/s/:spaceId/results/*', requireSpaceRole('learner'));

function spaceView(space: CurrentSpace): SpaceView {
  return {
    id: space.id, name: space.name, primaryColor: space.kit.theme.primaryColor, hasLogo: Boolean(space.kit.theme.logoKey),
    guardian: space.roles.includes('guardian'),
  };
}

/** Words, language and theme of a page inside the space, in the language of this person's pages. */
function spaceLabel(c: C) {
  const space = c.get('space');
  const lang = c.get('lang');
  return { t: makeLabel(lang, space.kit), lang, view: spaceView(space) };
}

function renderAdminHome(c: C) {
  const { t, lang, view } = spaceLabel(c);
  return page(c, adminHome(t, lang, view, c.get('user')!.display_name));
}

async function renderPublisherHome(c: C) {
  const { t, lang, view } = spaceLabel(c);
  const user = c.get('user')!;
  const subjects = await subjectsForPublisher(c.get('db'), view.id, user.id);
  return page(c, publisherHome(t, lang, view, user.display_name, subjects));
}

async function renderLearnerHome(c: C) {
  const { t, lang, view } = spaceLabel(c);
  const user = c.get('user')!;
  const learner = c.get('space').roles.includes('learner');
  const subjects = learner ? await subjectsForLearner(c.get('db'), view.id, user.id) : [];
  // R2-d (AT-15f): every learner is told while lesson activity is on, whether or not a guardian is linked.
  const notice = learner && (await activitySetting(c.get('db'), view.id)).enabled;
  return page(c, learnerHome(t, lang, view, user.display_name, subjects, learner, notice));
}

// The guardian home (release 2, R2-a): every learner actively linked to this
// person whose own access is active today, each with the subjects they see.
// Found from the session's person on every request, so a removed link or an
// ended learner is gone from the very next page. From R2-d, while lesson
// activity is on, each learner's card leads to their lesson-activity page.
async function renderGuardianHome(c: C) {
  const { t, lang, view } = spaceLabel(c);
  const db = c.get('db');
  const user = c.get('user')!;
  const learners = await linkedLearners(db, view.id, user.id, now());
  const cards: LearnerCard[] = [];
  for (const learner of learners) cards.push({ learner, subjects: await subjectsSeenBy(db, view.id, learner.id) });
  return page(c, guardianHome(t, lang, view, user.display_name, cards, (await activitySetting(db, view.id)).enabled));
}

// The space home is the home of the person's main role: an admin gets the
// admin home, a publisher the publisher home, a learner the learner home, and
// a guardian with no other role here the guardian home. A guardian who also
// holds another role reaches the guardian home from the nav (AT-9h).
app.get('/s/:spaceId', (c) => {
  const roles = c.get('space').roles;
  if (roles.includes('admin')) return renderAdminHome(c);
  if (roles.includes('publisher')) return renderPublisherHome(c);
  if (roles.includes('guardian') && !roles.includes('learner')) return renderGuardianHome(c);
  return renderLearnerHome(c);
});
app.get('/s/:spaceId/admin', (c) => renderAdminHome(c));
app.get('/s/:spaceId/publish', (c) => renderPublisherHome(c));
app.get('/s/:spaceId/linked', (c) => renderGuardianHome(c));

// One linked learner's page. Anyone the viewer may not see now (not linked,
// link removed, access ended, another space, no such person) gets the same
// 403 page, byte for byte, so an address reveals nothing.
app.get('/s/:spaceId/linked/:learnerId', async (c) => {
  const db = c.get('db');
  const { t, lang, view } = spaceLabel(c);
  const learner = await linkedLearner(db, view.id, c.get('user')!.id, c.req.param('learnerId'), now());
  if (!learner) return refuse(c, 403, 'noAccess');
  // R2-c (AT-11d): the learner's own published results, read only once the link is checked.
  const results = await ownResults(db, view.id, learner.id);
  const activity = (await activitySetting(db, view.id)).enabled;
  return page(c, guardianLearnerPage(t, lang, view, { learner, subjects: await subjectsSeenBy(db, view.id, learner.id) }, results, activity));
});

// One linked learner's lesson activity (R2-d, AT-15c): read only once the link
// is checked, exactly as the learner's page above (the same 403 page for
// anyone the viewer may not see now). Dates on or after "Recording since",
// the later of the switch-on day and this guardian's link day (AT-15c-2).
// While the setting is off, the "not switched on" line only (AT-15a).
app.get('/s/:spaceId/linked/:learnerId/activity', async (c) => {
  const db = c.get('db');
  const { t, lang, view } = spaceLabel(c);
  const guardianId = c.get('user')!.id;
  const learners = await linkedLearners(db, view.id, guardianId, now());
  const learner = learners.find((l) => l.id === c.req.param('learnerId'));
  if (!learner) return refuse(c, 403, 'noAccess');
  const setting = await activitySetting(db, view.id);
  const linked = await linkedSince(db, view.id, guardianId, learner.id);
  let on = null;
  if (setting.enabled && setting.since && linked) {
    const since = recordingSince(setting.since, linked);
    on = { since, blocks: await activityOf(db, view.id, learner.id, since) };
  }
  return page(c, guardianActivityPage(t, lang, view, { learners, learner, on }));
});

// My results (release 2, R2-b, AT-11a to 11c), behind the learner gate: the
// own published results of the person signed in, found from that person only.
// One result's address answers the same 403 page, byte for byte, for anything
// that is not one of the viewer's own published results: another person's,
// a draft, another space's, or no such row.
app.get('/s/:spaceId/results', async (c) => {
  const { t, lang, view } = spaceLabel(c);
  return page(c, myResultsPage(t, lang, view, await ownResults(c.get('db'), view.id, c.get('user')!.id)));
});

app.get('/s/:spaceId/results/:resultId', async (c) => {
  const { t, lang, view } = spaceLabel(c);
  const result = await ownResult(c.get('db'), view.id, c.get('user')!.id, c.req.param('resultId'));
  if (!result) return refuse(c, 403, 'noAccess');
  return page(c, resultPage(t, lang, view, result));
});

app.get('/s/:spaceId/logo', (c) => serveLogo(c, c.get('space').id, c.get('space').kit.theme.logoKey));

// Reading: a subject, a lesson, a stored file. Anything the person may not
// read here (another space's id, a subject not assigned, unpublished, or no
// such id) answers the same 403, so an address reveals nothing. A lesson or a
// file that was removed (AT-8), itself or with its lesson or chapter, answers
// "not found" (404) to someone who may read its subject, and 403 to anyone
// else; no removed row is ever read for the page itself (src/learning.ts).
async function removedOrRefused(c: C, subjectId: string | null) {
  const subject = subjectId && (await readableSubject(c.get('db'), c.get('space'), c.get('user')!.id, subjectId));
  return subject ? refuse(c, 404, 'notFound') : refuse(c, 403, 'noAccess');
}

app.get('/s/:spaceId/learn/:subjectId', async (c) => {
  const db = c.get('db');
  const space = c.get('space');
  const subject = await readableSubject(db, space, c.get('user')!.id, c.req.param('subjectId'));
  if (!subject) return refuse(c, 403, 'noAccess');
  const { t, lang, view } = spaceLabel(c);
  return page(c, subjectPage(t, lang, view, subject, await outline(db, space.id, subject.id)));
});

app.get('/s/:spaceId/read/:lessonId', async (c) => {
  const db = c.get('db');
  const space = c.get('space');
  const lesson = await findLesson(db, space.id, c.req.param('lessonId'));
  if (!lesson) return removedOrRefused(c, await removedLessonSubject(db, space.id, c.req.param('lessonId')));
  const subject = await readableSubject(db, space, c.get('user')!.id, lesson.subject_id);
  if (!subject) return refuse(c, 403, 'noAccess');
  const { t, lang, view } = spaceLabel(c);
  const materials = await lessonMaterials(db, space.id, lesson.id);
  // R2-d (AT-15d, 15f): a learner opening their own lesson is told while lesson
  // activity is on, and the day is kept (one statement that checks the setting
  // and the assignment again). Only a GET is an open: HEAD answers the same
  // page and writes nothing. A failed write never stops the lesson (AT-15i);
  // its log line is the fixed event alone, with no name, title or id.
  const learner = space.roles.includes('learner');
  const notice = learner && (await activitySetting(db, space.id)).enabled;
  if (notice && c.req.method === 'GET') {
    try {
      await recordOpen(db, { spaceId: space.id, lessonId: lesson.id, learnerId: c.get('user')!.id, now: now() });
    } catch {
      logError('activity write failed');
    }
  }
  return page(c, lessonPage(t, lang, view, { subject, lesson, materials, notice }));
});

app.get('/s/:spaceId/file/:materialId', async (c) => {
  const db = c.get('db');
  const space = c.get('space');
  const file = await findFile(db, space.id, c.req.param('materialId'));
  if (!file) return removedOrRefused(c, await removedMaterialSubject(db, space.id, c.req.param('materialId')));
  const subject = await readableSubject(db, space, c.get('user')!.id, file.subject_id);
  if (!subject) return refuse(c, 403, 'noAccess');
  const obj = await c.env.FILES.get(file.storage_key);
  if (!obj) return refuse(c, 404, 'notFound');
  const headers = materialFileHeaders(file.kind, obj.httpMetadata?.contentType ?? '', obj.httpEtag);
  if (c.req.header('if-none-match') === obj.httpEtag) {
    obj.body.cancel();
    return new Response(null, { status: 304, headers });
  }
  return new Response(obj.body, { headers });
});

// ----------------------------------------------------------------- admin ----
// The admin's screens (AT-2), all under /s/<space>/admin behind the admin
// gate: people (appoint a publisher or a learner; one person's page with a
// new password and a reset link), groups and subjects. Every lookup and write
// is inside this space (src/admin.ts). A refused form shows its plain message
// on the same page and stores nothing; a done form answers 303.
const NAME_MAX = 100;

async function countryCodeOf(c: C, spaceId: string): Promise<string> {
  const row = await c.get('db').first<{ default_country_code: string }>('SELECT default_country_code FROM space WHERE id = ?', spaceId);
  return row?.default_country_code ?? '';
}

/** Whether a person's access here has ended (by its end date, or with "End access now"). */
const hasEnded = (p: PersonRow) => membershipStatus(p.valid_from, p.valid_until, now(), p.ended_on) === 'ended';

// The people list (release 1.1): a search box that the server answers (part
// of a name or a username, in this space only), and the people whose access
// has ended in a collapsed "Ended" part below the others.
async function renderPeople(c: C, extra: { values?: AppointForm; error?: string } = {}, status: 200 | 400 = 200) {
  const { t, lang, view } = spaceLabel(c);
  const search = c.req.method === 'GET' ? searchText(c.req.query('q') ?? '') : '';
  const people = (await peopleOf(c.get('db'), view.id, search)).map((p) => ({ ...p, ended: hasEnded(p) }));
  const body = peoplePage(t, lang, view, {
    people, search, today: utcDate(now()), ownEnd: c.get('space').validUntil, values: extra.values ?? {}, error: extra.error,
  });
  return page(c, body, status);
}

app.get('/s/:spaceId/admin/people', (c) => renderPeople(c));

// Rules 1 and 2: an admin appoints a publisher or a learner only, never past
// their own end date. The mobile is read the local way with the space's
// default country code and kept in international form.
app.post('/s/:spaceId/admin/people', async (c) => {
  const db = c.get('db');
  const space = c.get('space');
  const { t } = spaceLabel(c);
  const body = await c.req.parseBody();
  const values: AppointForm = {
    display_name: field(body, 'display_name'),
    username: field(body, 'username').toLowerCase(),
    role: field(body, 'role'),
    mobile: field(body, 'mobile'),
    valid_until: field(body, 'valid_until'),
  };
  const password = typeof body.password === 'string' ? body.password : '';
  const mobile = normaliseMobile(values.mobile ?? '', await countryCodeOf(c, space.id));
  const today = utcDate(now());
  const end = values.valid_until ?? '';
  const role = values.role ?? '';
  const displayName = cleanDisplayName(values.display_name ?? '');
  const error =
    !displayName ? t('displayNameInvalid')
      : !isUsername(values.username ?? '') ? t('usernameInvalid')
        : password.length < MIN_PASSWORD ? t('passwordTooShort')
          : !isAppointable(role) ? t('roleInvalid')
            : !mobile ? t('mobileInvalid')
              : !isIsoDate(end) || end < today ? t('endDateInvalid')
                : end > space.validUntil ? t('endDateBeyondOwn', { date: space.validUntil })
                  : (await db.first('SELECT 1 AS one FROM user WHERE username = ?', values.username!)) ? t('usernameTaken')
                    : undefined;
  if (error || !mobile || !displayName || !isAppointable(role)) return renderPeople(c, { values, error }, 400);
  try {
    await appoint(db, {
      spaceId: space.id, grantedBy: c.get('user')!.id, username: values.username!, passwordHash: await hashPassword(password, c.get('iterations')),
      displayName, mobile, role, validFrom: today, validUntil: end, now: now(),
    });
  } catch {
    return renderPeople(c, { values, error: t('usernameTaken') }, 400); // taken in the same instant
  }
  return c.redirect(`/s/${space.id}/admin/people#people`, 303);
});

// One person's page and its actions (rule 5): set a new password, or send a
// one-time reset link; and from release 1.1 (AT-6) correct the name, the
// mobile number and the end date, end access now, and restore access. The
// same pages serve the owner for the admins they appointed (AMBER: the owner
// already had this page for them; the owner has no end date of their own).
function personView(p: PersonRow, roleLabel: string): PersonView {
  return {
    id: p.id, username: p.username, display_name: p.display_name, roleLabel, valid_until: p.valid_until, digits: lastDigits(p.mobile),
    ended: hasEnded(p), endedDate: endedDate(p.valid_until, p.ended_on),
  };
}

interface PersonPlace {
  frame: PersonFrame;
  view: PersonView;
  person: PersonRow;
  spaceId: string;
  /** The memberships this appointer manages (src/admin.ts). */
  roles: ManagedRoles;
  /** Mobile numbers typed the local way are read with this country code. */
  countryCode: string;
  /** The message's language: the space's first, with its kit. */
  message: { t: Label; spaceName: string; role: string };
  /** For a guardian of this space (release 2, R2-a): their links, shown on their page. */
  links?: LinksView;
}

/** A guardian's links as their person page shows them: linked now, removed,
 * and the learners of the space who can still be linked (never the guardian
 * themselves). */
async function linksView(c: C, spaceId: string, guardianId: string): Promise<LinksView> {
  const db = c.get('db');
  const rows = await linksOf(db, spaceId, guardianId);
  const active = rows.filter((r) => r.ended_at === null).map(({ id, display_name }) => ({ id, display_name }));
  const ended = rows.filter((r) => r.ended_at !== null).map(({ id, display_name }) => ({ id, display_name }));
  const linked = new Set(rows.map((r) => r.id));
  const choices = (await learnersOf(db, spaceId)).filter((l) => l.id !== guardianId && !linked.has(l.id));
  return { active, ended, choices };
}

async function adminPlace(c: C): Promise<PersonPlace | null> {
  const { t, lang, view } = spaceLabel(c);
  const person = await managedPerson(c.get('db'), view.id, c.req.param('userId') ?? '');
  if (!person) return null;
  const links = (await isGuardianHere(c.get('db'), view.id, person.id)) ? await linksView(c, view.id, person.id) : undefined;
  // The WhatsApp message is always in the space's first language, whatever the admin reads.
  const kit = c.get('space').kit;
  const firstT = makeLabel(kit.languages[0], kit);
  return {
    frame: {
      t,
      base: `/s/${view.id}/admin/people/${person.id}`,
      back: { href: `/s/${view.id}/admin/people`, label: t('backToPeople') },
      frame: (title, body) => spacePage(t, lang, view, title, body),
      today: utcDate(now()),
      ownEnd: c.get('space').validUntil,
      spaceName: view.name,
    },
    view: personView(person, t(person.role as Concept | 'guardian')),
    person,
    spaceId: view.id,
    roles: ADMIN_MANAGES,
    countryCode: await countryCodeOf(c, view.id),
    message: { t: firstT, spaceName: view.name, role: firstT('admin') },
    links,
  };
}

async function ownerPlace(c: C): Promise<PersonPlace | null> {
  const space = await ownerSpace(c, c.req.param('id') ?? '');
  const person = space && (await spaceAdmin(c.get('db'), space.id, c.req.param('userId') ?? ''));
  if (!space || !person) return null;
  const t = makeLabel(c.get('lang'), space.kit);
  const first = space.kit.languages[0];
  const spaceT = makeLabel(first, space.kit);
  return {
    frame: {
      t,
      base: `/owner/spaces/${space.id}/people/${person.id}`,
      back: { href: `/owner/spaces/${space.id}`, label: space.name },
      frame: (title, body) => layout({ t, lang: c.get('lang'), title, body, signedIn: true }),
      today: utcDate(now()),
      ownEnd: null,
      spaceName: space.name,
    },
    view: personView(person, t('admin')),
    person,
    spaceId: space.id,
    roles: OWNER_MANAGES,
    countryCode: space.countryCode,
    message: { t: spaceT, spaceName: space.name, role: spaceT('ownerWord') },
  };
}

const NOTICES = {
  saved: 'saved', mobile: 'mobileChanged', ended: 'accessEndedDone', restored: 'accessRestored',
  linked: 'linkDone', unlinked: 'unlinkDone', relinked: 'linkRestored',
} as const satisfies Record<string, PersonNotice>;

/** The notice a person page shows after a done form (?done=…), if any. */
function noticeOf(c: C): PersonNotice | undefined {
  const done = c.req.query('done') ?? '';
  return Object.hasOwn(NOTICES, done) ? NOTICES[done as keyof typeof NOTICES] : undefined;
}

/** The refusal for a typed end date, in the appointer's language, or undefined when it may be used. */
function typedEndDateError(p: PersonPlace, date: string): string | undefined {
  const check = checkTypedEndDate(date, now(), p.frame.ownEnd);
  if (check.ok) return undefined;
  return check.error === 'endDateBeyondOwn' ? p.frame.t('endDateBeyondOwn', { date: p.frame.ownEnd ?? '' }) : p.frame.t('endDateInvalid');
}

function personRoutes(path: string, place: (c: C) => Promise<PersonPlace | null>): void {
  app.get(path, async (c) => {
    const p = await place(c);
    return p ? page(c, personPage(p.frame, p.view, { links: p.links, notice: noticeOf(c) })) : refuse(c, 403, 'noAccess');
  });

  // Corrections (AT-6): the display name (release 1 bounds), the mobile
  // number (read with the space's country code; empty keeps the old one; a new
  // one kills every earlier reset link), and, while access lasts, the end date.
  // A typed end date is a real date, not before today and not later than the
  // appointer's own; an end date left as it was is not checked again.
  app.post(`${path}/correct`, async (c) => {
    const p = await place(c);
    if (!p) return refuse(c, 403, 'noAccess');
    const { t } = p.frame;
    const body = await c.req.parseBody();
    const values: CorrectionValues = { display_name: field(body, 'display_name'), mobile: field(body, 'mobile'), valid_until: field(body, 'valid_until') };
    const displayName = cleanDisplayName(values.display_name ?? '');
    const mobile = values.mobile ? normaliseMobile(values.mobile, p.countryCode) : p.person.mobile;
    const end = p.view.ended ? null : values.valid_until ?? '';
    const changedEnd = end !== null && end !== p.person.valid_until ? end : null;
    const error = !displayName ? t('displayNameInvalid')
      : !mobile ? t('mobileInvalid')
        : changedEnd !== null ? typedEndDateError(p, changedEnd)
          : undefined;
    if (error || !displayName || !mobile) return page(c, personPage(p.frame, p.view, { links: p.links, error, values }), 400);
    const mobileChanged = mobile !== p.person.mobile;
    await correctPerson(c.get('db'), {
      spaceId: p.spaceId, userId: p.person.id, roles: p.roles, displayName, mobile, mobileChanged, validUntil: changedEnd, now: now(),
    });
    return c.redirect(`${p.frame.base}?done=${mobileChanged ? 'mobile' : 'saved'}`, 303);
  });

  // End access now, step one: a page that names the person (a GET changes nothing).
  app.get(`${path}/end`, async (c) => {
    const p = await place(c);
    if (!p) return refuse(c, 403, 'noAccess');
    return p.view.ended ? c.redirect(p.frame.base) : page(c, endConfirmPage(p.frame, p.view));
  });

  // The confirming tap: access ends at once, with every sign-in and open reset
  // link of the person (src/admin.ts). Ending an ended person changes nothing.
  app.post(`${path}/end`, async (c) => {
    const p = await place(c);
    if (!p) return refuse(c, 403, 'noAccess');
    if (p.view.ended) return c.redirect(p.frame.base, 303);
    await endAccess(c.get('db'), { spaceId: p.spaceId, userId: p.person.id, roles: p.roles, today: utcDate(now()), now: now() });
    return c.redirect(`${p.frame.base}?done=ended`, 303);
  });

  // Restore access: a new (typed) end date; the groups and subjects were never removed.
  app.post(`${path}/restore`, async (c) => {
    const p = await place(c);
    if (!p) return refuse(c, 403, 'noAccess');
    if (!p.view.ended) return c.redirect(p.frame.base, 303);
    const end = field(await c.req.parseBody(), 'valid_until');
    const error = typedEndDateError(p, end);
    if (error) return page(c, personPage(p.frame, p.view, { links: p.links, error, values: { valid_until: end } }), 400);
    await restoreAccess(c.get('db'), { spaceId: p.spaceId, userId: p.person.id, roles: p.roles, validUntil: end });
    return c.redirect(`${p.frame.base}?done=restored`, 303);
  });

  // A person whose access has ended gets no reset link and no new password
  // (AT-6 follow-up): the appointer restores access first. The page says so
  // plainly and nothing is stored.
  const endedRefusal = (c: C, p: PersonPlace) =>
    page(c, personPage(p.frame, p.view, { links: p.links, error: p.frame.t('endedNoReset', { name: p.person.display_name }) }), 400);

  app.get(`${path}/link`, async (c) => {
    const p = await place(c);
    if (!p) return refuse(c, 403, 'noAccess');
    return p.view.ended ? endedRefusal(c, p) : page(c, confirmLinkPage(p.frame, p.view));
  });

  // The confirming tap: kills every earlier link of this person, makes a new
  // one, and shows it once as a WhatsApp button and a Copy button. The message
  // is the product's fixed text; nothing in the request enters it.
  app.post(`${path}/link`, async (c) => {
    const p = await place(c);
    if (!p) return refuse(c, 403, 'noAccess');
    if (p.view.ended) return endedRefusal(c, p);
    const sender = c.get('user')!;
    const token = await issueResetLink(c.get('db'), { userId: p.person.id, spaceId: p.spaceId, createdBy: sender.id, now: now() });
    const address = new URL(c.req.url).origin;
    const link = `${address}/r/${token}`;
    const message = resetMessage(p.message.t, {
      space: p.message.spaceName, sender: sender.display_name, role: p.message.role, name: p.person.display_name, address, link,
    });
    c.header('referrer-policy', 'no-referrer');
    return page(c, linkReadyPage(p.frame, p.view, { link, whatsapp: whatsappHref(p.person.mobile, message) }));
  });

  app.post(`${path}/password`, async (c) => {
    const p = await place(c);
    if (!p) return refuse(c, 403, 'noAccess');
    if (p.view.ended) return endedRefusal(c, p);
    const body = await c.req.parseBody();
    const password = typeof body.new_password === 'string' ? body.new_password : '';
    if (password.length < MIN_PASSWORD) return page(c, personPage(p.frame, p.view, { links: p.links, error: p.frame.t('passwordTooShort') }), 400);
    await setPassword(c.get('db'), p.person.id, await hashPassword(password, c.get('iterations')));
    return page(c, personPage(p.frame, p.view, { links: p.links, notice: 'setPasswordDone' }));
  });
}

personRoutes('/s/:spaceId/admin/people/:userId', adminPlace);
personRoutes('/owner/spaces/:id/people/:userId', ownerPlace);

// The links of a guardian (release 2, R2-a, AT-9b and 9e), on the person page
// of the guardian, behind the admin gate. Linking (or restoring a removed link) takes a
// learner of this space who is not the guardian themselves; anything else is
// refused on the same page and changes nothing. Removing a link is two steps:
// a page that names both people (a GET changes nothing), then the confirming
// tap. The guardian's next request no longer shows the learner.
app.post('/s/:spaceId/admin/people/:userId/links', async (c) => {
  const p = await adminPlace(c);
  if (!p || !p.links) return refuse(c, 403, 'noAccess');
  const body = await c.req.parseBody();
  const learnerId = field(body, 'learner');
  const db = c.get('db');
  const error = learnerId === p.person.id ? p.frame.t('linkSelfRefused')
    : !(await isLearnerHere(db, p.spaceId, learnerId)) ? p.frame.t('linkRefused')
      : undefined;
  if (error || !(await link(db, { spaceId: p.spaceId, guardianId: p.person.id, learnerId, by: c.get('user')!.id, now: now() }))) {
    return page(c, personPage(p.frame, p.view, { links: p.links, error: error ?? p.frame.t('linkRefused') }), 400);
  }
  return c.redirect(`${p.frame.base}?done=${field(body, 'restore') === '1' ? 'relinked' : 'linked'}#links-title`, 303);
});

/** The guardian's place and the learner of an active link of theirs, or null. */
async function activeLink(c: C): Promise<{ p: PersonPlace; learner: { id: string; display_name: string } } | null> {
  const p = await adminPlace(c);
  const learner = p?.links?.active.find((l) => l.id === c.req.param('learnerId'));
  return p && learner ? { p, learner } : null;
}

app.get('/s/:spaceId/admin/people/:userId/links/:learnerId/remove', async (c) => {
  const found = await activeLink(c);
  if (!found) return refuse(c, 403, 'noAccess');
  return page(c, unlinkConfirmPage(found.p.frame, found.p.view, found.learner));
});

app.post('/s/:spaceId/admin/people/:userId/links/:learnerId/remove', async (c) => {
  const found = await activeLink(c);
  if (!found) return refuse(c, 403, 'noAccess');
  const { p, learner } = found;
  await unlink(c.get('db'), { spaceId: p.spaceId, guardianId: p.person.id, learnerId: learner.id, now: now() });
  return c.redirect(`${p.frame.base}?done=unlinked#links-title`, 303);
});

// Groups: a name and the learners in it.
async function renderSets(c: C, extra: { error?: string; name?: string } = {}, status: 200 | 400 = 200) {
  const { t, lang, view } = spaceLabel(c);
  const db = c.get('db');
  const body = setsPage(t, lang, view, { sets: await setsOf(db, view.id), learners: await learnersOf(db, view.id), ...extra });
  return page(c, body, status);
}

/** The chosen learners, when every one is a learner of this space; otherwise null. */
async function chosenLearners(c: C, body: Record<string, unknown>, name: string): Promise<string[] | null> {
  const chosen = [...new Set(fieldList(body, name))];
  const learners = new Set((await learnersOf(c.get('db'), c.get('space').id)).map((l) => l.id));
  return chosen.every((id) => learners.has(id)) ? chosen : null;
}

app.get('/s/:spaceId/admin/sets', (c) => renderSets(c));

app.post('/s/:spaceId/admin/sets', async (c) => {
  const { t } = spaceLabel(c);
  const body = await c.req.parseBody({ all: true });
  const name = field(body, 'name');
  if (!name || name.length > NAME_MAX) return renderSets(c, { error: t('nameRequired'), name }, 400);
  const members = await chosenLearners(c, body, 'member');
  if (!members) return renderSets(c, { error: t('choiceInvalid'), name }, 400);
  await createSet(c.get('db'), c.get('space').id, name, members);
  return c.redirect(`/s/${c.get('space').id}/admin/sets#sets`, 303);
});

/** The notice on the page of a group or a subject after a done form (?saved=1, ?renamed=1). */
function itemNotice(c: C): ItemNotice | undefined {
  return c.req.query('renamed') === '1' ? 'renamed' : c.req.query('saved') === '1' ? 'saved' : undefined;
}

/** A new name for a group or a subject (AT-7): the display-name bounds (1 to
 * 100 characters, one line), or null with nothing to store. */
const typedItemName = (body: Record<string, unknown>, name: string) => cleanItemName(typeof body[name] === 'string' ? body[name] : '');

async function renderSet(
  c: C,
  set: { id: string; name: string },
  extra: { notice?: ItemNotice; error?: string; typedName?: string } = {},
  status: 200 | 400 = 200,
) {
  const { t, lang, view } = spaceLabel(c);
  const db = c.get('db');
  const members = (await setsOf(db, view.id)).find((s) => s.id === set.id)?.members.map((m) => m.id) ?? [];
  return page(c, setPage(t, lang, view, { set, learners: await learnersOf(db, view.id), members, ...extra }), status);
}

app.get('/s/:spaceId/admin/sets/:groupId', async (c) => {
  const set = await findSet(c.get('db'), c.get('space').id, c.req.param('groupId'));
  return set ? renderSet(c, set, { notice: itemNotice(c) }) : refuse(c, 403, 'noAccess');
});

app.post('/s/:spaceId/admin/sets/:groupId', async (c) => {
  const spaceId = c.get('space').id;
  const set = await findSet(c.get('db'), spaceId, c.req.param('groupId'));
  if (!set) return refuse(c, 403, 'noAccess');
  const members = await chosenLearners(c, await c.req.parseBody({ all: true }), 'member');
  if (!members) return renderSet(c, set, { error: spaceLabel(c).t('choiceInvalid') }, 400);
  await saveSetMembers(c.get('db'), spaceId, set.id, members);
  return c.redirect(`/s/${spaceId}/admin/sets/${set.id}?saved=1`, 303);
});

// Renaming a group (AT-7): every page reads the name from the group's row, so
// the new name shows everywhere at the next page. A refused name stores nothing.
app.post('/s/:spaceId/admin/sets/:groupId/name', async (c) => {
  const spaceId = c.get('space').id;
  const set = await findSet(c.get('db'), spaceId, c.req.param('groupId'));
  if (!set) return refuse(c, 403, 'noAccess');
  const body = await c.req.parseBody();
  const name = typedItemName(body, 'name');
  if (!name) return renderSet(c, set, { error: spaceLabel(c).t('renameInvalid'), typedName: field(body, 'name') }, 400);
  await renameSet(c.get('db'), spaceId, set.id, name);
  return c.redirect(`/s/${spaceId}/admin/sets/${set.id}?renamed=1`, 303);
});

// Subjects: a title, one responsible publisher, and who may read it.
async function renderTopics(c: C, extra: { error?: string; title?: string } = {}, status: 200 | 400 = 200) {
  const { t, lang, view } = spaceLabel(c);
  const db = c.get('db');
  const body = topicsPage(t, lang, view, { topics: await topicsOf(db, view.id), publishers: await publishersOf(db, view.id), ...extra });
  return page(c, body, status);
}

/** The chosen publisher ('' for nobody yet), when it is a publisher of this space; otherwise undefined. */
async function chosenPublisher(c: C, body: Record<string, unknown>): Promise<string | null | undefined> {
  const id = field(body, 'publisher');
  if (!id) return null;
  const publishers = await publishersOf(c.get('db'), c.get('space').id);
  return publishers.some((p) => p.id === id) ? id : undefined;
}

app.get('/s/:spaceId/admin/topics', (c) => renderTopics(c));

app.post('/s/:spaceId/admin/topics', async (c) => {
  const { t } = spaceLabel(c);
  const body = await c.req.parseBody();
  const title = field(body, 'title');
  if (!title || title.length > TITLE_MAX) return renderTopics(c, { error: t('titleInvalid'), title }, 400);
  const publisher = await chosenPublisher(c, body);
  if (publisher === undefined) return renderTopics(c, { error: t('choiceInvalid'), title }, 400);
  const id = await createTopic(c.get('db'), c.get('space').id, title, publisher);
  return c.redirect(`/s/${c.get('space').id}/admin/topics/${id}`, 303);
});

async function renderTopic(
  c: C,
  subjectId: string,
  extra: { notice?: ItemNotice; error?: string; typedName?: string } = {},
  status: 200 | 400 = 200,
) {
  const db = c.get('db');
  const { t, lang, view } = spaceLabel(c);
  const topic = await findTopic(db, view.id, subjectId);
  if (!topic) return refuse(c, 403, 'noAccess');
  const body = topicPage(t, lang, view, {
    topic,
    publishers: await publishersOf(db, view.id),
    sets: (await setsOf(db, view.id)).map((s) => ({ id: s.id, display_name: s.name })),
    learners: await learnersOf(db, view.id),
    readers: await topicReaders(db, view.id, topic.id),
    ...extra,
  });
  return page(c, body, status);
}

app.get('/s/:spaceId/admin/topics/:subjectId', (c) => renderTopic(c, c.req.param('subjectId'), { notice: itemNotice(c) }));

app.post('/s/:spaceId/admin/topics/:subjectId', async (c) => {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const topic = await findTopic(db, spaceId, c.req.param('subjectId'));
  if (!topic) return refuse(c, 403, 'noAccess');
  const body = await c.req.parseBody({ all: true });
  const publisher = await chosenPublisher(c, body);
  const learnerIds = await chosenLearners(c, body, 'learner');
  const sets = new Set((await setsOf(db, spaceId)).map((s) => s.id));
  const setIds = [...new Set(fieldList(body, 'set'))];
  if (publisher === undefined || !learnerIds || !setIds.every((id) => sets.has(id))) {
    return renderTopic(c, topic.id, { error: spaceLabel(c).t('choiceInvalid') }, 400);
  }
  await saveTopic(db, spaceId, topic.id, { publisherId: publisher, setIds, learnerIds });
  return c.redirect(`/s/${spaceId}/admin/topics/${topic.id}?saved=1`, 303);
});

// Renaming a subject (AT-7): only its title changes; the publisher's chapters,
// lessons and materials, and who may read it, are untouched.
app.post('/s/:spaceId/admin/topics/:subjectId/name', async (c) => {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const topic = await findTopic(db, spaceId, c.req.param('subjectId'));
  if (!topic) return refuse(c, 403, 'noAccess');
  const body = await c.req.parseBody();
  const title = typedItemName(body, 'title');
  if (!title) return renderTopic(c, topic.id, { error: spaceLabel(c).t('renameInvalid'), typedName: field(body, 'title') }, 400);
  await renameTopic(db, spaceId, topic.id, title);
  return c.redirect(`/s/${spaceId}/admin/topics/${topic.id}?renamed=1`, 303);
});

// ------------------------------------------------------------ reset link ----
// The page a one-time reset link opens (src/reset.ts). The link is the
// permission: it works once, for 30 minutes, and only with the username it
// was made for. Failed usernames count for the link (a bounded number) and
// for the rate limit (the link's person and the client). The page is in the
// space's first language, with its name; the token never leaves in a Referer.
interface ResetPlace {
  link: FoundLink;
  t: Label;
  lang: Lang;
  space: ResetSpace;
}

async function resetPlace(c: C): Promise<ResetPlace | null> {
  c.header('referrer-policy', 'no-referrer');
  const link = await findResetLink(c.get('db'), c.req.param('token') ?? '');
  if (!link) return null;
  const kit = loadKit(link.kit_json);
  const lang = kit.languages[0];
  return { link, t: makeLabel(lang, kit), lang, space: { name: link.space_name, primaryColor: kit.theme.primaryColor } };
}

const deadLink = (c: C, r: ResetPlace | null) =>
  page(c, r ? resetDeadPage(r.t, r.lang, r.space) : resetDeadPage(label(c), c.get('lang'), null), 410);

app.get('/r/:token', async (c) => {
  const r = await resetPlace(c);
  if (!r || resetLinkState(r.link, now()) !== 'usable') return deadLink(c, r);
  return page(c, resetPage(r.t, r.lang, r.space, { action: new URL(c.req.url).pathname }));
});

// The retry of a form whose first send changed the password but never got its
// answer back (the client cut it off, HTTP 499; release 2, AT-10g). On a link
// that this very password change used, within its 30 minutes, the same
// username with the password now stored says so plainly, in both languages of
// the space, instead of "link gone". Anything else on a used link (another
// username or password, an expired link) gets the usual dead-link page; a
// wrong guess counts toward the rate limit like a failed sign-in, so a used
// link is no way to try passwords.
async function retriedReset(c: C, r: ResetPlace) {
  if (resetLinkState(r.link, now()) !== 'used' || now() >= Number(r.link.expires_at)) return null;
  const db = c.get('db');
  const body = await c.req.parseBody();
  const username = typedUsername(field(body, 'username'));
  const password = typeof body.new_password === 'string' ? body.new_password : '';
  if (username !== r.link.username || password.length < MIN_PASSWORD) return null;
  const door = await openDoor(db, r.link.username, clientAddress(c));
  if (attemptBlock(door.rows, now())) return null;
  const user = await db.first<{ password_hash: string }>('SELECT password_hash FROM user WHERE id = ?', r.link.user_id);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await recordFailure(db, door, now());
    return null;
  }
  const kit = loadKit(r.link.kit_json);
  const [first, second] = kit.languages;
  return page(c, resetAlreadyChangedPage(
    { t: makeLabel(first, kit), lang: first },
    second ? { t: makeLabel(second, kit), lang: second } : null,
    r.space,
  ));
}

app.post('/r/:token', async (c) => {
  const db = c.get('db');
  const r = await resetPlace(c);
  if (!r) return deadLink(c, r);
  if (resetLinkState(r.link, now()) !== 'usable') return (await retriedReset(c, r)) ?? deadLink(c, r);
  const { t, lang, space, link } = r;
  const action = new URL(c.req.url).pathname;
  const body = await c.req.parseBody();
  const username = typedUsername(field(body, 'username'));
  const password = typeof body.new_password === 'string' ? body.new_password : '';
  const door = await openDoor(db, link.username, clientAddress(c));
  const block = attemptBlock(door.rows, now());
  if (block) return page(c, resetPage(t, lang, space, { action, username, error: tooMany(t, block.until) }), 429);
  if (username !== link.username) {
    await countWrongUsername(db, link.id);
    await recordFailure(db, door, now());
    return page(c, resetPage(t, lang, space, { action, username, error: t('resetWrongUser') }), 401);
  }
  if (password.length < MIN_PASSWORD) return page(c, resetPage(t, lang, space, { action, username, error: t('passwordTooShort') }), 400);
  if (!(await useResetLink(db, link, await hashPassword(password, c.get('iterations')), now()))) return deadLink(c, r);
  await clearUser(db, door);
  return page(c, resetDonePage(t, lang, space));
});

// ------------------------------------------------------------ publishing ----
// The publisher's editor (AT-3). Every address is under /s/<space>/publish,
// so the publisher gate has already run; each handler then finds the item
// only inside this space and only in a subject this publisher is responsible
// for, and each write repeats that check in its own statement. Anything else
// answers the same 403 as a reading page. A refused form shows its plain
// message on the same page and changes nothing; a done form goes back to the
// editor (303, so a reload does not post again).
const TITLE_MAX = 200;
const NOTE_MAX = 10_000;
const materialKey = (spaceId: string, materialId: string) => `spaces/${spaceId}/files/${materialId}`;
const subjectEditorPath = (spaceId: string, subjectId: string) => `/s/${spaceId}/publish/edit/${subjectId}`;
const lessonEditorPath = (spaceId: string, lessonId: string) => `/s/${spaceId}/publish/compose/${lessonId}`;

function titleFrom(body: Record<string, unknown>): string | null {
  const title = field(body, 'title');
  return title && title.length <= TITLE_MAX ? title : null;
}

/** What an editor page says after a done form (?done=…, AT-8). */
const DONE: Record<string, EditorNotice> = { renamed: 'renamed', removed: 'removedDone', restored: 'restoredDone', replaced: 'replacedDone' };
const editorNotice = (c: C): EditorNotice | undefined => DONE[c.req.query('done') ?? ''];

async function renderSubjectEditor(c: C, subject: SubjectRow, error?: LabelKey, notice?: EditorNotice) {
  const { t, lang, view } = spaceLabel(c);
  const parts = await outline(c.get('db'), view.id, subject.id);
  return page(c, subjectEditor(t, lang, view, subject, parts, error && t(error), notice), error ? 400 : 200);
}

async function renderLessonEditor(
  c: C,
  lesson: EditableLesson,
  error?: LabelKey,
  status: 200 | 400 | 413 = 200,
  extra: { notice?: EditorNotice; typedName?: string } = {},
) {
  const db = c.get('db');
  const { t, lang, view } = spaceLabel(c);
  const subject = await editableSubject(db, view.id, c.get('user')!.id, lesson.subject_id);
  if (!subject) return refuse(c, 403, 'noAccess');
  const materials = await lessonMaterials(db, view.id, lesson.id);
  return page(c, lessonEditor(t, lang, view, { subject, lesson, materials, error: error && t(error), ...extra }), status);
}

app.get('/s/:spaceId/publish/edit/:subjectId', async (c) => {
  const subject = await editableSubject(c.get('db'), c.get('space').id, c.get('user')!.id, c.req.param('subjectId'));
  if (!subject) return refuse(c, 403, 'noAccess');
  return renderSubjectEditor(c, subject, undefined, editorNotice(c));
});

app.post('/s/:spaceId/publish/edit/:subjectId/add', async (c) => {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const userId = c.get('user')!.id;
  const subject = await editableSubject(db, spaceId, userId, c.req.param('subjectId'));
  if (!subject) return refuse(c, 403, 'noAccess');
  const title = titleFrom(await c.req.parseBody());
  if (!title) return renderSubjectEditor(c, subject, 'titleInvalid');
  if (!(await addChapter(db, spaceId, userId, subject.id, title))) return refuse(c, 403, 'noAccess');
  return c.redirect(subjectEditorPath(spaceId, subject.id) + '#outline', 303);
});

for (const [action, published] of [['publish', true], ['unpublish', false]] as const) {
  app.post(`/s/:spaceId/publish/edit/:subjectId/${action}`, async (c) => {
    const spaceId = c.get('space').id;
    const subjectId = c.req.param('subjectId');
    if (!(await setPublished(c.get('db'), spaceId, c.get('user')!.id, subjectId, published))) return refuse(c, 403, 'noAccess');
    return c.redirect(subjectEditorPath(spaceId, subjectId), 303);
  });
}

app.post('/s/:spaceId/publish/part/:chapterId/add', async (c) => {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const userId = c.get('user')!.id;
  const chapter = await editableChapter(db, spaceId, userId, c.req.param('chapterId'));
  const subject = chapter && (await editableSubject(db, spaceId, userId, chapter.subject_id));
  if (!chapter || !subject) return refuse(c, 403, 'noAccess');
  const title = titleFrom(await c.req.parseBody());
  if (!title) return renderSubjectEditor(c, subject, 'titleInvalid');
  if (!(await addLesson(db, spaceId, userId, chapter.id, title))) return refuse(c, 403, 'noAccess');
  return c.redirect(subjectEditorPath(spaceId, subject.id) + '#outline', 303);
});

app.post('/s/:spaceId/publish/part/:chapterId/move', async (c) => {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const chapter = await editableChapter(db, spaceId, c.get('user')!.id, c.req.param('chapterId'));
  if (!chapter) return refuse(c, 403, 'noAccess');
  const direction = field(await c.req.parseBody(), 'direction');
  if (isDirection(direction)) await moveChapter(db, spaceId, chapter, direction);
  return c.redirect(subjectEditorPath(spaceId, chapter.subject_id) + '#outline', 303);
});

app.get('/s/:spaceId/publish/compose/:lessonId', async (c) => {
  const lesson = await editableLesson(c.get('db'), c.get('space').id, c.get('user')!.id, c.req.param('lessonId'));
  if (!lesson) return missingItem(c, 'lesson', c.req.param('lessonId'));
  return renderLessonEditor(c, lesson, undefined, 200, { notice: editorNotice(c) });
});

app.post('/s/:spaceId/publish/compose/:lessonId/move', async (c) => {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const lesson = await editableLesson(db, spaceId, c.get('user')!.id, c.req.param('lessonId'));
  if (!lesson) return refuse(c, 403, 'noAccess');
  const direction = field(await c.req.parseBody(), 'direction');
  if (isDirection(direction)) await moveLesson(db, spaceId, lesson, direction);
  return c.redirect(subjectEditorPath(spaceId, lesson.subject_id) + '#outline', 303);
});

// One address for the four forms (file, video link, web link, note). A file's
// kind (PDF or image) and its stored type come from its content; a refused
// file never reaches storage, and a stored file whose row cannot be written is
// removed again.
app.post('/s/:spaceId/publish/compose/:lessonId/add', async (c) => {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const userId = c.get('user')!.id;
  const lesson = await editableLesson(db, spaceId, userId, c.req.param('lessonId'));
  if (!lesson) return refuse(c, 403, 'noAccess');
  if (materialBodyTooLarge(c.req.header('content-length'))) return renderLessonEditor(c, lesson, 'uploadTooLarge', 413);
  const body = await c.req.parseBody();
  const title = titleFrom(body);
  if (!title) return renderLessonEditor(c, lesson, 'titleInvalid', 400);
  const kind = field(body, 'kind');
  const item: NewMaterial = { id: crypto.randomUUID(), kind: 'note', title, storageKey: null, url: null, noteText: null };
  let upload: { bytes: Uint8Array; type: string } | null = null;

  if (kind === 'file') {
    const file = body.file;
    if (!(file instanceof File) || file.size === 0) return renderLessonEditor(c, lesson, 'uploadMissing', 400);
    if (file.size > MATERIAL_MAX_BYTES) return renderLessonEditor(c, lesson, 'uploadTooLarge', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const found = sniffMaterial(bytes);
    if (!found) return renderLessonEditor(c, lesson, 'uploadType', 400);
    item.kind = found.kind;
    item.storageKey = materialKey(spaceId, item.id);
    upload = { bytes, type: found.type };
  } else if (kind === 'video_link' || kind === 'link') {
    const url = externalUrl(field(body, 'url'));
    if (!url) return renderLessonEditor(c, lesson, 'linkInvalid', 400);
    item.kind = kind;
    item.url = url;
  } else if (kind === 'note') {
    // Browsers send a text box's line breaks as CR LF; keep them as LF.
    const text = (typeof body.text === 'string' ? body.text : '').replace(/\r\n?/g, '\n').trim();
    if (!text || text.length > NOTE_MAX) return renderLessonEditor(c, lesson, 'noteInvalid', 400);
    item.noteText = text;
  } else {
    return renderLessonEditor(c, lesson, 'kindInvalid', 400);
  }

  if (upload && item.storageKey) await c.env.FILES.put(item.storageKey, upload.bytes, { httpMetadata: { contentType: upload.type } });
  let written = false;
  try {
    written = await addMaterial(db, spaceId, userId, lesson.id, item);
  } finally {
    if (!written && item.storageKey) await c.env.FILES.delete(item.storageKey);
  }
  if (!written) return refuse(c, 403, 'noAccess');
  return c.redirect(lessonEditorPath(spaceId, lesson.id) + '#items', 303);
});

app.post('/s/:spaceId/publish/item/:materialId/move', async (c) => {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const material = await editableMaterial(db, spaceId, c.get('user')!.id, c.req.param('materialId'));
  if (!material) return refuse(c, 403, 'noAccess');
  const direction = field(await c.req.parseBody(), 'direction');
  if (isDirection(direction)) await moveMaterial(db, spaceId, material, direction);
  return c.redirect(lessonEditorPath(spaceId, material.lesson_id) + '#items', 303);
});

// ------------------------------------------- correcting content (AT-8) ----
// Renaming a chapter, a lesson or a material; replacing a material's file;
// removing (a GET step that names the item, then a POST) and restoring from
// Recently removed. Still under /s/<space>/publish, behind the publisher gate
// and the cross-origin check; each lookup and each write repeats the
// ownership check (src/publishing.ts, src/removal.ts). A removal or a restore
// is one database statement; nothing is deleted from the database or storage.
const partPath = (spaceId: string, chapterId: string) => `/s/${spaceId}/publish/part/${chapterId}`;
const itemPath = (spaceId: string, materialId: string) => `/s/${spaceId}/publish/item/${materialId}`;
const PARAM: Record<ContentKind, 'chapterId' | 'lessonId' | 'materialId'> = { chapter: 'chapterId', lesson: 'lessonId', material: 'materialId' };
const INSIDE: Record<'chapter' | 'lesson', 'lesson' | 'material'> = { chapter: 'lesson', lesson: 'material' };

/** An address of the publisher's that finds nothing that shows: "not found"
 * when it is one of her own removed items, otherwise the usual 403. */
async function missingItem(c: C, kind: ContentKind, id: string) {
  const item = await ownedItem(c.get('db'), c.get('space').id, c.get('user')!.id, kind, id);
  return item ? refuse(c, 404, 'notFound') : refuse(c, 403, 'noAccess');
}

async function renderChapterPage(
  c: C,
  chapter: EditableChapter,
  extra: { error?: LabelKey; notice?: EditorNotice; typedName?: string } = {},
  status: 200 | 400 = 200,
) {
  const db = c.get('db');
  const { t, lang, view } = spaceLabel(c);
  const subject = await editableSubject(db, view.id, c.get('user')!.id, chapter.subject_id);
  if (!subject) return refuse(c, 403, 'noAccess');
  const lessons = (await outline(db, view.id, subject.id)).find((ch) => ch.id === chapter.id)?.lessons ?? [];
  const { error, ...rest } = extra;
  return page(c, chapterPage(t, lang, view, { subject, chapter, lessons, error: error && t(error), ...rest }), status);
}

async function renderMaterialPage(
  c: C,
  material: EditableMaterial,
  extra: { error?: LabelKey; notice?: EditorNotice; typedName?: string } = {},
  status: 200 | 400 | 413 = 200,
) {
  const { t, lang, view } = spaceLabel(c);
  const subject = await editableSubject(c.get('db'), view.id, c.get('user')!.id, material.subject_id);
  if (!subject) return refuse(c, 403, 'noAccess');
  const { error, ...rest } = extra;
  return page(c, materialPage(t, lang, view, { subject, material, error: error && t(error), ...rest }), status);
}

app.get('/s/:spaceId/publish/part/:chapterId', async (c) => {
  const chapter = await editableChapter(c.get('db'), c.get('space').id, c.get('user')!.id, c.req.param('chapterId'));
  if (!chapter) return missingItem(c, 'chapter', c.req.param('chapterId'));
  return renderChapterPage(c, chapter, { notice: editorNotice(c) });
});

app.get('/s/:spaceId/publish/item/:materialId', async (c) => {
  const material = await editableMaterial(c.get('db'), c.get('space').id, c.get('user')!.id, c.req.param('materialId'));
  if (!material) return missingItem(c, 'material', c.req.param('materialId'));
  return renderMaterialPage(c, material, { notice: editorNotice(c) });
});

// Renaming (AT-8): the title only, with the AT-7 bounds (1 to 100 characters,
// one line). Every page reads the title from its row, so learners see the new
// one at their next page. A refused title stores nothing.
app.post('/s/:spaceId/publish/part/:chapterId/name', async (c) => {
  const spaceId = c.get('space').id;
  const userId = c.get('user')!.id;
  const chapter = await editableChapter(c.get('db'), spaceId, userId, c.req.param('chapterId'));
  if (!chapter) return missingItem(c, 'chapter', c.req.param('chapterId'));
  const body = await c.req.parseBody();
  const title = typedItemName(body, 'title');
  if (!title) return renderChapterPage(c, chapter, { error: 'renameInvalid', typedName: field(body, 'title') }, 400);
  if (!(await renameChapter(c.get('db'), spaceId, userId, chapter.id, title))) return refuse(c, 403, 'noAccess');
  return c.redirect(`${partPath(spaceId, chapter.id)}?done=renamed`, 303);
});

app.post('/s/:spaceId/publish/compose/:lessonId/name', async (c) => {
  const spaceId = c.get('space').id;
  const userId = c.get('user')!.id;
  const lesson = await editableLesson(c.get('db'), spaceId, userId, c.req.param('lessonId'));
  if (!lesson) return missingItem(c, 'lesson', c.req.param('lessonId'));
  const body = await c.req.parseBody();
  const title = typedItemName(body, 'title');
  if (!title) return renderLessonEditor(c, lesson, 'renameInvalid', 400, { typedName: field(body, 'title') });
  if (!(await renameLesson(c.get('db'), spaceId, userId, lesson.id, title))) return refuse(c, 403, 'noAccess');
  return c.redirect(`${lessonEditorPath(spaceId, lesson.id)}?done=renamed`, 303);
});

app.post('/s/:spaceId/publish/item/:materialId/name', async (c) => {
  const spaceId = c.get('space').id;
  const userId = c.get('user')!.id;
  const material = await editableMaterial(c.get('db'), spaceId, userId, c.req.param('materialId'));
  if (!material) return missingItem(c, 'material', c.req.param('materialId'));
  const body = await c.req.parseBody();
  const title = typedItemName(body, 'title');
  if (!title) return renderMaterialPage(c, material, { error: 'renameInvalid', typedName: field(body, 'title') }, 400);
  if (!(await renameMaterial(c.get('db'), spaceId, userId, material.id, title))) return refuse(c, 403, 'noAccess');
  return c.redirect(`${itemPath(spaceId, material.id)}?done=renamed`, 303);
});

// Replacing a material's file (AT-8): the upload rules apply (kind and type
// from the content, at most 25 MB), and the new file must be of the same kind
// (a PDF for a PDF, an image for an image). The new bytes go under a new key;
// one statement switches the material to it; a refused or failed switch
// removes only the new, never-served object again. The old object is kept.
app.post('/s/:spaceId/publish/item/:materialId/file', async (c) => {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const userId = c.get('user')!.id;
  const material = await editableMaterial(db, spaceId, userId, c.req.param('materialId'));
  if (!material) return missingItem(c, 'material', c.req.param('materialId'));
  if (material.kind !== 'pdf' && material.kind !== 'image') return renderMaterialPage(c, material, { error: 'replaceKind' }, 400);
  if (materialBodyTooLarge(c.req.header('content-length'))) return renderMaterialPage(c, material, { error: 'uploadTooLarge' }, 413);
  const file = (await c.req.parseBody()).file;
  if (!(file instanceof File) || file.size === 0) return renderMaterialPage(c, material, { error: 'uploadMissing' }, 400);
  if (file.size > MATERIAL_MAX_BYTES) return renderMaterialPage(c, material, { error: 'uploadTooLarge' }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const found = sniffMaterial(bytes);
  if (!found) return renderMaterialPage(c, material, { error: 'uploadType' }, 400);
  if (found.kind !== material.kind) return renderMaterialPage(c, material, { error: 'replaceKind' }, 400);
  const key = replacementKey(spaceId, material.id);
  await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: found.type } });
  let switched = false;
  try {
    switched = await switchFile(db, spaceId, userId, material, key);
  } finally {
    if (!switched) await c.env.FILES.delete(key);
  }
  if (!switched) return refuse(c, 403, 'noAccess');
  return c.redirect(`${itemPath(spaceId, material.id)}?done=replaced`, 303);
});

/** An item that shows, as the remove step needs it: its title, where Cancel goes, and where a done removal goes. */
async function shownItem(c: C, kind: ContentKind, id: string): Promise<{ title: string; back: string; after: string } | null> {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const userId = c.get('user')!.id;
  if (kind === 'chapter') {
    const ch = await editableChapter(db, spaceId, userId, id);
    return ch && { title: ch.title, back: partPath(spaceId, ch.id), after: `${subjectEditorPath(spaceId, ch.subject_id)}?done=removed#outline` };
  }
  if (kind === 'lesson') {
    const l = await editableLesson(db, spaceId, userId, id);
    return l && { title: l.title, back: lessonEditorPath(spaceId, l.id), after: `${subjectEditorPath(spaceId, l.subject_id)}?done=removed#outline` };
  }
  const m = await editableMaterial(db, spaceId, userId, id);
  return m && { title: m.title, back: itemPath(spaceId, m.id), after: `${lessonEditorPath(spaceId, m.lesson_id)}?done=removed#items` };
}

const REMOVE = { chapter: removeChapter, lesson: removeLesson, material: removeMaterial };
const RESTORE = { chapter: restoreChapter, lesson: restoreLesson, material: restoreMaterial };

for (const kind of ['chapter', 'lesson', 'material'] as const) {
  const path = `/s/:spaceId/publish/${SEGMENT[kind]}/:${PARAM[kind]}`;
  const idOf = (c: C) => c.req.param(PARAM[kind]) ?? '';

  /** The remove step, or its refusal when a lesson or chapter still shows content. */
  async function renderStep(c: C, id: string, item: { title: string; back: string }, status: 200 | 400 = 200) {
    const { t, lang, view } = spaceLabel(c);
    const titles = kind === 'material' ? [] : await stillShowing(c.get('db'), view.id, kind, id);
    const refused = kind !== 'material' && titles.length ? { inside: INSIDE[kind], titles } : undefined;
    return page(c, removeConfirmPage(t, lang, view, { kind, id, title: item.title, back: item.back, refused }), refused ? status : 200);
  }

  // Step one: a page that names the item (a plain GET, which changes nothing).
  app.get(`${path}/remove`, async (c) => {
    const item = await shownItem(c, kind, idOf(c));
    if (!item) return missingItem(c, kind, idOf(c));
    return renderStep(c, idOf(c), item);
  });

  // The confirming tap: one statement, which also refuses a lesson or chapter that still shows content.
  app.post(`${path}/remove`, async (c) => {
    const id = idOf(c);
    const item = await shownItem(c, kind, id);
    if (!item) return missingItem(c, kind, id);
    if (await REMOVE[kind](c.get('db'), c.get('space').id, c.get('user')!.id, id, now())) return c.redirect(item.after, 303);
    return renderStep(c, id, item, 400);
  });

  // Restore (from Recently removed): back in its old place, with the same file.
  app.post(`${path}/restore`, async (c) => {
    const db = c.get('db');
    const spaceId = c.get('space').id;
    const id = idOf(c);
    const item = await ownedItem(db, spaceId, c.get('user')!.id, kind, id);
    if (!item) return refuse(c, 403, 'noAccess');
    const place = kind === 'material'
      ? `${lessonEditorPath(spaceId, item.parent_id ?? '')}?done=restored#items`
      : `${subjectEditorPath(spaceId, item.subject_id)}?done=restored#outline`;
    if (await RESTORE[kind](db, spaceId, c.get('user')!.id, id, now())) return c.redirect(place, 303);
    if (!item.removed && !item.parent_removed) return c.redirect(place, 303); // already back (a second tap)
    if (!item.parent_removed) return refuse(c, 403, 'noAccess');
    // What holds it is removed too: restore that first.
    const { t, lang, view } = spaceLabel(c);
    const subject = await editableSubject(db, spaceId, c.get('user')!.id, item.subject_id);
    if (!subject) return refuse(c, 403, 'noAccess');
    const items = await recentlyRemoved(db, spaceId, subject.id);
    const blocking = items.find((i) => i.id === id)?.blocked_by ?? item.parent_title ?? '';
    return page(c, removedPage(t, lang, view, { subject, items, error: t('restoreParentFirst', { name: blocking }) }), 400);
  });
}

// Recently removed: everything removed in one of the publisher's subjects.
app.get('/s/:spaceId/publish/edit/:subjectId/removed', async (c) => {
  const db = c.get('db');
  const subject = await editableSubject(db, c.get('space').id, c.get('user')!.id, c.req.param('subjectId'));
  if (!subject) return refuse(c, 403, 'noAccess');
  const { t, lang, view } = spaceLabel(c);
  return page(c, removedPage(t, lang, view, { subject, items: await recentlyRemoved(db, view.id, subject.id) }));
});

// ------------------------------------------------- exams and marks (R2-b) ----
// The publisher's exams and marks (release 2, AT-10), under /s/<space>/publish
// behind the publisher gate. Each handler finds the subject or the exam only
// inside this space and only when this publisher is responsible for its
// subject (src/exams.ts), and each write repeats that check in its own
// statement; anything else answers the same 403. Publishing takes two steps:
// Publish on the marks page saves the typed marks as the draft and shows a
// page listing every row (a POST answer: a plain link never publishes); its
// confirming button publishes that list in one atomic batch.
async function renderExamList(c: C, subject: SubjectRow, extra: { values?: NewExamValues; error?: string } = {}, status: 200 | 400 = 200) {
  const { t, lang, view } = spaceLabel(c);
  const exams = await examsOfSubject(c.get('db'), view.id, c.get('user')!.id, subject.id);
  return page(c, examListPage(t, lang, view, { subject, exams, ...extra }), status);
}

app.get('/s/:spaceId/publish/edit/:subjectId/marks', async (c) => {
  const subject = await editableSubject(c.get('db'), c.get('space').id, c.get('user')!.id, c.req.param('subjectId'));
  if (!subject) return refuse(c, 403, 'noAccess');
  return renderExamList(c, subject);
});

app.post('/s/:spaceId/publish/edit/:subjectId/marks', async (c) => {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const userId = c.get('user')!.id;
  const subject = await editableSubject(db, spaceId, userId, c.req.param('subjectId'));
  if (!subject) return refuse(c, 403, 'noAccess');
  const { t } = spaceLabel(c);
  const body = await c.req.parseBody();
  const values: NewExamValues = { title: field(body, 'title'), exam_date: field(body, 'exam_date'), max_mark: field(body, 'max_mark') };
  const title = titleFrom(body);
  const max = readMaxMark(values.max_mark ?? '');
  const error = !title ? t('titleInvalid') : !isIsoDate(values.exam_date ?? '') ? t('examDateInvalid') : max === null ? t('maxMarkInvalid') : undefined;
  if (error || !title || max === null) return renderExamList(c, subject, { values, error }, 400);
  const id = await createExam(db, { spaceId, publisherId: userId, subjectId: subject.id, title, date: values.exam_date!, max, now: now() });
  if (!id) return refuse(c, 403, 'noAccess');
  return c.redirect(`/s/${spaceId}/publish/marks/${id}`, 303);
});

/** An exam of this publisher, with today's list of its subject and its stored rows; null when the exam is not theirs. */
interface MarksPlace {
  exam: ExamRow;
  roster: RosterRow[];
  tails: Map<string, string>;
  results: Map<string, ResultRow>;
}

async function marksPlace(c: C): Promise<MarksPlace | null> {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const userId = c.get('user')!.id;
  const exam = await editableExam(db, spaceId, userId, c.req.param('examId') ?? '');
  if (!exam) return null;
  const roster = await rosterOf(db, spaceId, exam.subject_id, now());
  const results = new Map((await resultsOfExam(db, spaceId, userId, exam.id)).map((r) => [r.learner_user_id, r]));
  return { exam, roster, tails: secondIds(roster), results };
}

const MARKS_DONE: Record<string, MarksNotice> = { draft: 'draftSaved', published: 'marksPublished', details: 'examSaved' };

/** The marks page; typed values and errors come from a refused form, otherwise from the stored draft. */
function renderMarks(
  c: C,
  m: MarksPlace,
  typed?: Map<string, { typed: string; absent: boolean; error?: string }>,
  error?: string,
  examForm?: { values: NewExamValues; error: string },
) {
  const { t, lang, view } = spaceLabel(c);
  const rows: MarkRowView[] = m.roster.map((learner) => {
    const stored = m.results.get(learner.id);
    const tail = m.tails.get(learner.id) ?? '';
    if (stored?.published_at != null) return { learner, tail, typed: '', absent: false, published: stored };
    const entry = typed?.get(learner.id);
    if (entry) return { learner, tail, ...entry };
    return { learner, tail, typed: stored?.status === 'marked' ? markText(stored.mark ?? 0) : '', absent: stored?.status === 'absent' };
  });
  const notice = c.req.method === 'GET' ? MARKS_DONE[c.req.query('done') ?? ''] : undefined;
  // R2-c (AT-12d): once any row is published, the exam's title, date and maximum are locked.
  const locked = [...m.results.values()].some((r) => r.published_at != null);
  return page(
    c,
    marksPage(t, lang, view, { exam: m.exam, rows, notice, error, locked, examValues: examForm?.values, examError: examForm?.error }),
    typed || examForm ? 400 : 200,
  );
}

/** The rows to publish now (every learner on today's list whose row is not
 * published yet), how many people changed since the page the publisher
 * filled in (`seen`), and a fingerprint of exactly what the page showed. */
async function confirmation(m: MarksPlace, seen: string[]) {
  const open = m.roster.filter((l) => m.results.get(l.id)?.published_at == null);
  const rows: ConfirmRowView[] = open.map((learner) => ({ learner, tail: m.tails.get(learner.id) ?? '', result: m.results.get(learner.id) ?? null }));
  const current = new Set(m.roster.map((l) => l.id));
  const before = new Set(seen);
  const changed = [...before].filter((id) => !current.has(id)).length + [...current].filter((id) => !before.has(id)).length;
  const shown = JSON.stringify([m.roster.map((l) => l.id), rows.map((r) => [r.learner.id, r.result?.status ?? '', r.result?.mark ?? ''])]);
  return { rows, changed, version: await tokenHash(shown) };
}

function renderConfirm(c: C, m: MarksPlace, v: Awaited<ReturnType<typeof confirmation>>, status: 200 | 409 = 200, error?: string) {
  const { t, lang, view } = spaceLabel(c);
  return page(c, confirmPage(t, lang, view, { exam: m.exam, ...v, learners: m.roster.map((l) => l.id), error }), status);
}

function alreadyPublished(c: C, m: MarksPlace) {
  const { t, lang, view } = spaceLabel(c);
  return page(c, marksMessagePage(t, lang, view, m.exam, t('alreadyPublished')), 409);
}

app.get('/s/:spaceId/publish/marks/:examId', async (c) => {
  const m = await marksPlace(c);
  return m ? renderMarks(c, m) : refuse(c, 403, 'noAccess');
});

// Save draft, or Publish (step one). Every row of the page is read first; any
// refused row (letters, two decimals, outside 0 to the maximum, a mark and
// Absent together, and for Publish an empty row) sends the page back with the
// error beside it, and nothing is saved or published. A row published already
// is never changed here, and a person who left the list is never saved.
app.post('/s/:spaceId/publish/marks/:examId', async (c) => {
  const m = await marksPlace(c);
  if (!m) return refuse(c, 403, 'noAccess');
  const { t } = spaceLabel(c);
  const body = await c.req.parseBody({ all: true });
  const publishing = field(body, 'action') === 'publish';
  const seen = [...new Set(fieldList(body, 'learner'))];
  const onList = new Set(m.roster.map((l) => l.id));
  const typed = new Map<string, { typed: string; absent: boolean; error?: string }>();
  const draft: { learnerId: string; value: DraftValue }[] = [];
  let refused = false;
  for (const id of seen) {
    if (!onList.has(id) || m.results.get(id)?.published_at != null) continue;
    const text = field(body, `mark:${id}`);
    const absent = field(body, `absent:${id}`) === '1';
    const row = readRow(text, absent, m.exam.max_mark);
    const error = row.kind === 'refused' ? row.error : publishing && row.kind === 'empty' ? 'markMissing' as const : undefined;
    typed.set(id, { typed: text, absent, error: error && t(error, { max: markText(m.exam.max_mark) }) });
    if (error) refused = true;
    else if (row.kind !== 'refused') draft.push({ learnerId: id, value: row });
  }
  if (refused) return renderMarks(c, m, typed, t('marksRefused'));
  await saveDraft(c.get('db'), { spaceId: c.get('space').id, publisherId: c.get('user')!.id, examId: m.exam.id, rows: draft, now: now() });
  if (!publishing) return c.redirect(`/s/${c.get('space').id}/publish/marks/${m.exam.id}?done=draft`, 303);
  const saved = (await marksPlace(c))!;
  const v = await confirmation(saved, seen);
  if (!v.rows.length) return alreadyPublished(c, saved);
  return renderConfirm(c, saved, v);
});

// Publish (step two): the confirming tap. It publishes exactly the rows the
// confirmation page listed, in one batch, each with its history row. If the
// list or a value changed since that page (another tab saved, a person joined
// or left), nothing is published and the page is shown again; if those rows
// are published already (a second tab), it says so and changes nothing.
app.post('/s/:spaceId/publish/marks/:examId/publish', async (c) => {
  const m = await marksPlace(c);
  if (!m) return refuse(c, 403, 'noAccess');
  const body = await c.req.parseBody({ all: true });
  const v = await confirmation(m, [...new Set(fieldList(body, 'learner'))]);
  if (!v.rows.length) return alreadyPublished(c, m);
  if (v.changed || v.rows.some((r) => !r.result)) return renderConfirm(c, m, v, 409);
  if (field(body, 'version') !== v.version) return renderConfirm(c, m, v, 409, spaceLabel(c).t('marksChanged'));
  const db = c.get('db');
  const spaceId = c.get('space').id;
  try {
    await publishRows(db, { spaceId, publisherId: c.get('user')!.id, examId: m.exam.id, rows: v.rows.map((r) => r.result!), now: now() });
  } catch (err) {
    // Another tab published these rows in the same moment: nothing of this batch was written.
    const after = await marksPlace(c);
    if (after && v.rows.every((r) => after.results.get(r.learner.id)?.published_at != null)) return alreadyPublished(c, after);
    throw err;
  }
  return c.redirect(`/s/${spaceId}/publish/marks/${m.exam.id}?done=published#rows`, 303);
});

// ------------------------------------------- results views, corrections ----
// Release 2, R2-c (contract product-contract-r2, AT-11d to 11f and AT-12).
//
// The exam's own fields: editable on the marks page until any row is
// published, then locked (AT-12d). The statement that saves them repeats both
// rules (src/exams.ts), so a row published meanwhile still locks them.
app.post('/s/:spaceId/publish/marks/:examId/details', async (c) => {
  const m = await marksPlace(c);
  if (!m) return refuse(c, 403, 'noAccess');
  const { t, lang, view } = spaceLabel(c);
  const body = await c.req.parseBody();
  const values: NewExamValues = { title: field(body, 'title'), exam_date: field(body, 'exam_date'), max_mark: field(body, 'max_mark') };
  const title = titleFrom(body);
  const max = readMaxMark(values.max_mark ?? '');
  const locked = () => page(c, marksMessagePage(t, lang, view, m.exam, t('examLocked')), 409);
  if (await isLocked(c.get('db'), view.id, m.exam.id)) return locked();
  const error = !title ? t('titleInvalid') : !isIsoDate(values.exam_date ?? '') ? t('examDateInvalid') : max === null ? t('maxMarkInvalid') : undefined;
  if (error || !title || max === null) return renderMarks(c, m, undefined, undefined, { values, error: error ?? t('titleInvalid') });
  const saved = await editExam(c.get('db'), { spaceId: view.id, publisherId: c.get('user')!.id, examId: m.exam.id, title, date: values.exam_date!, max });
  if (saved === 'locked') return locked();
  if (saved === 'belowDraft') return renderMarks(c, m, undefined, undefined, { values, error: t('maxBelowDraft') });
  return c.redirect(`/s/${view.id}/publish/marks/${m.exam.id}?done=details`, 303);
});

/** The history of every published row of an exam, with each row's second identifier. */
async function historyRowsOf(c: C, exam: ExamRow): Promise<HistoryRowView[]> {
  const db = c.get('db');
  const spaceId = c.get('space').id;
  const rows = await publishedRows(db, spaceId, exam.id);
  const entries = await historyOfExam(db, spaceId, exam.id);
  const tails = secondIds(rows.map((r) => ({ id: r.learner_user_id, display_name: r.display_name, username: r.username })));
  return rows.map((row) => ({ row, tail: tails.get(row.learner_user_id) ?? '', entries: entries.filter((e) => e.result_id === row.id) }));
}

// The publisher's view (AT-11e, AT-12b): every published row of an exam of
// theirs, with its history and a way to correct it. Anything else (one of
// another publisher, one of another space, or none) answers the same 403.
app.get('/s/:spaceId/publish/marks/:examId/history', async (c) => {
  const exam = await editableExam(c.get('db'), c.get('space').id, c.get('user')!.id, c.req.param('examId'));
  if (!exam) return refuse(c, 403, 'noAccess');
  const { t, lang, view } = spaceLabel(c);
  const notice = c.req.query('done') === 'corrected' ? t('correctionDone') : undefined;
  const back = { href: `/s/${view.id}/publish/marks/${exam.id}`, label: t('backToMarks') };
  return page(c, historyPage(t, lang, view, { exam, rows: await historyRowsOf(c, exam), back, correctable: true, notice }));
});

/** One published row of an exam of this publisher, by its learner, with its history; null for anything else. */
async function correctionPlace(c: C, learnerId: string): Promise<{ exam: ExamRow; row: HistoryRowView } | null> {
  const exam = await editableExam(c.get('db'), c.get('space').id, c.get('user')!.id, c.req.param('examId') ?? '');
  if (!exam || !learnerId) return null;
  const row = (await historyRowsOf(c, exam)).find((h) => h.row.learner_user_id === learnerId);
  return row ? { exam, row } : null;
}

function renderCorrection(c: C, p: { exam: ExamRow; row: HistoryRowView }, extra: { values?: MarkCorrectionValues; error?: string } = {}, status: 200 | 400 | 409 = 200) {
  const { t, lang, view } = spaceLabel(c);
  return page(c, correctionPage(t, lang, view, { exam: p.exam, row: p.row, ...extra }), status);
}

// A correction (AT-12a, 12c): only the subject's current publisher, only a
// published row, a new value from 0 to the maximum (or Absent) that differs
// from the current one, and a reason. The publisher's own mistakes (no reason,
// a mark out of range) bring the page back with the message and store
// nothing; anyone else, or any other row, gets the same 403. The page's
// version (the row's number of history rows) must still be the row's: a
// correction made meanwhile makes this one change nothing (409).
app.get('/s/:spaceId/publish/marks/:examId/correct', async (c) => {
  const p = await correctionPlace(c, c.req.query('learner') ?? '');
  return p ? renderCorrection(c, p) : refuse(c, 403, 'noAccess');
});

app.post('/s/:spaceId/publish/marks/:examId/correct', async (c) => {
  const body = await c.req.parseBody();
  const p = await correctionPlace(c, field(body, 'learner'));
  if (!p) return refuse(c, 403, 'noAccess');
  const { t } = spaceLabel(c);
  const values: MarkCorrectionValues = { mark: field(body, 'mark'), absent: field(body, 'absent') === '1', reason: field(body, 'reason') };
  const { row } = p.row;
  // A page older than the row (another tab corrected it since) changes nothing.
  if (field(body, 'version') !== String(row.versions)) return renderCorrection(c, p, { values, error: t('correctionChanged') }, 409);
  const max = markText(p.exam.max_mark);
  const read = readRow(values.mark ?? '', Boolean(values.absent), p.exam.max_mark);
  if (read.kind === 'refused') return renderCorrection(c, p, { values, error: t(read.error, { max }) }, 400);
  if (read.kind === 'empty') return renderCorrection(c, p, { values, error: t('markMissing') }, 400);
  const reason = (values.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, REASON_MAX);
  if (!reason) return renderCorrection(c, p, { values, error: t('correctionReasonMissing') }, 400);
  const next = read.kind === 'absent' ? { status: 'absent' as const, mark: null } : { status: 'marked' as const, mark: read.mark };
  if (next.status === row.status && next.mark === row.mark) return renderCorrection(c, p, { values, error: t('correctionSame') }, 400);
  const spaceId = c.get('space').id;
  try {
    await correctRow(c.get('db'), { spaceId, publisherId: c.get('user')!.id, examId: p.exam.id, row, next, reason, now: now() });
  } catch (err) {
    // Another tab corrected this row in the same moment: nothing of this batch was written.
    const after = await correctionPlace(c, row.learner_user_id);
    if (after && after.row.row.versions !== row.versions) return renderCorrection(c, after, { values, error: t('correctionChanged') }, 409);
    throw err;
  }
  return c.redirect(`/s/${spaceId}/publish/marks/${p.exam.id}/history?done=corrected#row-${row.learner_user_id}`, 303);
});

// The admin's view (AT-11e, AT-12b): every exam of the space with a published
// row, and each one's rows with their history, read-only. Drafts are their
// publisher's only. Another space's exam, or none, answers the same 403.
app.get('/s/:spaceId/admin/results', async (c) => {
  const { t, lang, view } = spaceLabel(c);
  return page(c, adminResultsPage(t, lang, view, await examsWithResults(c.get('db'), view.id)));
});

app.get('/s/:spaceId/admin/results/:examId', async (c) => {
  const exam = await examOfSpace(c.get('db'), c.get('space').id, c.req.param('examId'));
  if (!exam) return refuse(c, 403, 'noAccess');
  const { t, lang, view } = spaceLabel(c);
  const back = { href: `/s/${view.id}/admin/results`, label: t('resultsAll') };
  return page(c, historyPage(t, lang, view, { exam, rows: await historyRowsOf(c, exam), back, correctable: false }));
});

// ------------------------------------------------------- lesson activity ----
// The admin's switch (R2-d, AT-15b), behind the admin gate: one page that
// says what is recorded, who sees it and how long it is kept, with the
// learner's notice. Switching on needs the "people were told" tick, or
// nothing changes; switching off has its own step that names the effect, then
// deletes every lesson-view row of the space. A plain link (GET) changes nothing.
async function renderActivity(c: C, extra: Partial<AdminActivityView> = {}, status: 200 | 400 = 200) {
  const { t, lang, view } = spaceLabel(c);
  const setting = await activitySetting(c.get('db'), view.id);
  const done = c.req.method === 'GET' ? c.req.query('done') : undefined;
  return page(c, adminActivityPage(t, lang, view, {
    ...setting, done: done === 'on' || done === 'off' ? done : undefined, ...extra,
  }), status);
}

app.get('/s/:spaceId/admin/activity', (c) => renderActivity(c));

app.post('/s/:spaceId/admin/activity', async (c) => {
  const body = await c.req.parseBody();
  if (field(body, 'told') !== '1') return renderActivity(c, { error: spaceLabel(c).t('activityToldMissing') }, 400);
  await switchOn(c.get('db'), { spaceId: c.get('space').id, by: c.get('user')!.id, now: now() });
  return c.redirect(`/s/${c.get('space').id}/admin/activity?done=on`, 303);
});

app.get('/s/:spaceId/admin/activity/off', (c) => {
  const { t, lang, view } = spaceLabel(c);
  return page(c, adminActivityOffPage(t, lang, view));
});

app.post('/s/:spaceId/admin/activity/off', async (c) => {
  await switchOff(c.get('db'), { spaceId: c.get('space').id, by: c.get('user')!.id, now: now() });
  return c.redirect(`/s/${c.get('space').id}/admin/activity?done=off`, 303);
});

// ------------------------------------------------------------ my account ----
// Everyone can change their own password and choose the language of their own
// pages. The choice is among the languages of the person's space (their latest
// membership; for the owner, who has none, both product languages) and is
// stored on the person (user.lang). Inside a space it decides the page
// language and direction when the space offers it; outside any space it
// decides every signed-in page. Without a choice: the space's first language,
// else the browser's, as before.
async function accountLanguages(c: C): Promise<{ lang: Lang; choices: readonly Lang[] }> {
  const user = c.get('user')!;
  const row = await c.get('db').first<{ json: string }>(
    `SELECT k.json FROM membership m JOIN space s ON s.id = m.space_id JOIN kit k ON k.id = s.kit_id
      WHERE m.user_id = ? ORDER BY m.valid_until DESC LIMIT 1`,
    user.id,
  );
  const choices = row ? loadKit(row.json).languages : LANGS;
  const lang = user.lang && choices.includes(user.lang) ? user.lang : row ? choices[0] : c.get('lang');
  return { lang, choices };
}

use('/account/*', async (c, next) => {
  if (!c.get('user')) return c.redirect('/signin');
  c.set('lang', (await accountLanguages(c)).lang);
  await next();
});

function renderAccount(c: C, extra: { error?: string; done?: boolean; languageDone?: boolean } = {}, status: 200 | 400 = 200) {
  const user = c.get('user')!;
  return page(c, accountPage(label(c), c.get('lang'), { displayName: user.display_name, username: user.username, ...extra }), status);
}

app.get('/account', (c) => renderAccount(c, { languageDone: c.req.query('done') === 'language' }));

async function renderLanguage(c: C, error?: string) {
  const { choices } = await accountLanguages(c);
  return page(c, languagePage(label(c), c.get('lang'), { languages: choices, error }), error ? 400 : 200);
}

app.get('/account/language', (c) => renderLanguage(c));

app.post('/account/language', async (c) => {
  const user = c.get('user')!;
  const { choices } = await accountLanguages(c);
  const typed = field(await c.req.parseBody(), 'lang');
  const chosen = choices.find((l) => l === typed);
  if (!chosen) return renderLanguage(c, label(c)('languageInvalid'));
  await c.get('db').run('UPDATE user SET lang = ? WHERE id = ?', chosen, user.id);
  return c.redirect('/account?done=language', 303);
});

app.post('/account/password', async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const t = label(c);
  const body = await c.req.parseBody();
  const current = typeof body.current_password === 'string' ? body.current_password : '';
  const next = typeof body.new_password === 'string' ? body.new_password : '';
  const row = await db.first<{ password_hash: string }>('SELECT password_hash FROM user WHERE id = ?', user.id);
  if (!row || !(await verifyPassword(current, row.password_hash))) return renderAccount(c, { error: t('currentPasswordWrong') }, 400);
  if (next.length < MIN_PASSWORD) return renderAccount(c, { error: t('passwordTooShort') }, 400);
  await db.batch([
    ['UPDATE user SET password_hash = ? WHERE id = ?', await hashPassword(next, c.get('iterations')), user.id],
    ['DELETE FROM session WHERE user_id = ? AND id <> ?', user.id, user.sessionId], // every other sign-in ends
  ]);
  return renderAccount(c, { done: true });
});

// ------------------------------------------------------- not found, errors ----
app.notFound((c) => {
  const space = c.var.space;
  const lang = c.var.lang ?? (space ? space.kit.languages[0] : 'en');
  const t = makeLabel(lang, space?.kit);
  return page(c, messagePage(t, lang, t('notFound'), Boolean(c.var.user)), 404);
});

app.onError((err, c) => {
  const lang = c.var.lang ?? 'en';
  const t = makeLabel(lang);
  // A refusal raised by a middleware (the csrf check answers 403) stays a refusal.
  if (err instanceof HTTPException && err.status === 403) {
    return page(c, messagePage(t, lang, t('noAccess'), Boolean(c.var.user)), 403);
  }
  if (err instanceof HTTPException && err.status < 500) return err.getResponse();
  logError('request failed', err);
  return page(c, messagePage(t, lang, t('serverError'), false), 500);
});

