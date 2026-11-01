// LMS Lego router: server-rendered pages on Hono.
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { csrf } from 'hono/csrf';
import type { AppEnv, CurrentSpace } from './app-env.ts';
import { isIsoDate, membershipActive, utcDate } from './access.ts';
import { dummyHash, hashPassword, verifyPassword } from './auth/password.ts';
import { SESSION_COOKIE, SESSION_IDLE_MS, sessionDecision } from './auth/session.ts';
import { newRecoveryCode, randomToken, recoveryCodeHash, tokenHash } from './auth/tokens.ts';
import { now } from './clock.ts';
import { Db } from './db.ts';
import {
  LOGO_MAX_BYTES, MATERIAL_MAX_BYTES, fileHeaders, materialBodyTooLarge, materialFileHeaders, sniffLogo, sniffMaterial,
} from './files.ts';
import { makeLabel, productLang, type KitJson, type Lang, type LabelKey } from './labels.ts';
import {
  findFile, findLesson, lessonMaterials, outline, readableSubject, subjectsForLearner, subjectsForPublisher, type SubjectRow,
} from './learning.ts';
import { externalUrl } from './links.ts';
import { normaliseCountryCode, normaliseMobile } from './phone.ts';
import {
  addChapter, addLesson, addMaterial, editableChapter, editableLesson, editableMaterial, editableSubject, isDirection,
  moveChapter, moveLesson, moveMaterial, setPublished, type EditableLesson, type NewMaterial,
} from './publishing.ts';
import { SEED_KITS, seedKit } from './kits/seed.ts';
import { registerTestHooks } from './test-hooks.ts';
import { FREE_PLAN, UsageMeter, type FlushBatch } from './usage.ts';
import { accountPage } from './views/account.ts';
import { recoverPage, recoveryCodePage, setupPage, signInPage } from './views/auth.ts';
import { messagePage, type Html } from './views/layout.ts';
import { learnerHome, lessonPage, subjectPage } from './views/learn.ts';
import { newSpacePage, ownerHome, ownerSpacePage, type AdminRow, type AppointValues, type NewSpaceValues } from './views/owner.ts';
import { lessonEditor, publisherHome, subjectEditor } from './views/publish.ts';
import { accessEndedPage, adminHome, membershipsPage, type SpaceView } from './views/space.ts';

type C = Context<AppEnv>;

const USERNAME = /^[a-z0-9._-]{3,32}$/;
const COLOUR = /^#[0-9a-fA-F]{6}$/;
const MIN_PASSWORD = 8;
const logoKey = (spaceId: string) => `spaces/${spaceId}/logo`;

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
    console.error('usage flush failed', err);
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

function page(c: C, body: Html, status: 200 | 400 | 401 | 403 | 404 | 413 | 500 = 200) {
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

async function startSession(c: C, userId: string): Promise<void> {
  const token = randomToken();
  await c.get('db').run('INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)', await tokenHash(token), userId, now() + SESSION_IDLE_MS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: new URL(c.req.url).protocol === 'https:',
    maxAge: SESSION_IDLE_MS / 1000,
  });
}

function loadKit(json: string): KitJson {
  return JSON.parse(json) as KitJson;
}

// ------------------------------------------------------------------ app ----
export const app = new Hono<AppEnv>();

// Count every request in memory; flush at most once a minute, after the response.
app.use('*', async (c, next) => {
  const m = getMeter();
  m.recordRequest(now());
  c.set('db', new Db(c.env.DB, (rows) => m.recordWrites(rows, now())));
  c.set('lang', productLang(c.req.header('accept-language')));
  c.set('user', null);
  await next();
  const batch = m.takeFlush(now());
  if (batch) c.executionCtx.waitUntil(flushUsage(c.env.DB, batch));
});

// Forms are accepted only from this site's own pages.
app.use('*', csrf());

// Server-side session from the HTTP-only cookie.
app.use('*', async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = c.get('db');
    const id = await tokenHash(token);
    const row = await db.first<{ expires_at: number; id: string; username: string; display_name: string; is_owner: number }>(
      'SELECT s.expires_at, u.id, u.username, u.display_name, u.is_owner FROM session s JOIN user u ON u.id = s.user_id WHERE s.id = ?',
      id,
    );
    const decision = row ? sessionDecision(row.expires_at, now()) : 'expired';
    if (row && decision !== 'expired') {
      if (decision === 'refresh') await db.run('UPDATE session SET expires_at = ? WHERE id = ?', now() + SESSION_IDLE_MS, id);
      c.set('user', { id: row.id, username: row.username, display_name: row.display_name, is_owner: row.is_owner, sessionId: id });
    } else {
      if (row) await db.run('DELETE FROM session WHERE id = ?', id);
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
  const username = field(body, 'username').toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const mobileInput = field(body, 'mobile');
  const mobile = normaliseMobile(mobileInput);
  const error = !USERNAME.test(username)
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
      id, username, await hashPassword(password), username, mobile, await recoveryCodeHash(code), now(),
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

app.post('/signin', async (c) => {
  const t = label(c);
  const body = await c.req.parseBody();
  const username = field(body, 'username').toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const user = await c.get('db').first<{ id: string; password_hash: string }>('SELECT id, password_hash FROM user WHERE username = ?', username);
  const ok = await verifyPassword(password, user?.password_hash ?? (await dummyHash()));
  if (!user || !ok) return page(c, signInPage(t, c.get('lang'), { error: t('signInFailed'), username }), 401);
  await startSession(c, user.id);
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
  const username = field(body, 'username').toLowerCase();
  const code = field(body, 'code');
  const password = typeof body.password === 'string' ? body.password : '';
  const oldHash = await recoveryCodeHash(code);
  const owner = await db.first<{ id: string }>(
    'SELECT id FROM user WHERE username = ? AND is_owner = 1 AND recovery_hash = ?',
    username, oldHash,
  );
  if (!owner) return page(c, recoverPage(t, c.get('lang'), { error: t('recoverFailed'), username }), 401);
  if (password.length < MIN_PASSWORD) return page(c, recoverPage(t, c.get('lang'), { error: t('passwordTooShort'), username }), 400);

  const next = newRecoveryCode();
  const changed = await db.run(
    'UPDATE user SET password_hash = ?, recovery_hash = ? WHERE id = ? AND recovery_hash = ?',
    await hashPassword(password), await recoveryCodeHash(next), owner.id, oldHash,
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
app.use('/owner', requireOwner);
app.use('/owner/*', requireOwner);

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
  const row = await c.get('db').first<{ id: string; name: string; default_country_code: string; json: string }>(
    'SELECT s.id, s.name, s.default_country_code, k.json FROM space s JOIN kit k ON k.id = s.kit_id WHERE s.id = ?',
    spaceId,
  );
  return row ? { id: row.id, name: row.name, countryCode: row.default_country_code, kit: loadKit(row.json) } : null;
}

async function renderOwnerSpace(c: C, spaceId: string, extra: { error?: string; values?: AppointValues } = {}, status: 200 | 400 = 200) {
  const space = await ownerSpace(c, spaceId);
  if (!space) return refuse(c, 404, 'notFound');
  const admins = await c.get('db').all<AdminRow>(
    `SELECT u.username, u.display_name, u.mobile, m.valid_until
       FROM membership m JOIN user u ON u.id = m.user_id
      WHERE m.space_id = ? AND m.role = 'admin' ORDER BY u.username`,
    spaceId,
  );
  const t = makeLabel(c.get('lang'), space.kit);
  return page(c, ownerSpacePage(t, c.get('lang'), { space, admins, error: extra.error, values: extra.values ?? {}, today: utcDate(now()) }), status);
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
  const today = utcDate(now());
  const error =
    !values.display_name || values.display_name.length > 100
      ? t('nameRequired')
      : !USERNAME.test(values.username ?? '')
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
  if (error || !mobile) return renderOwnerSpace(c, spaceId, { error, values }, 400);

  const userId = crypto.randomUUID();
  try {
    await db.batch([
      [
        'INSERT INTO user (id, username, password_hash, display_name, mobile, is_owner, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        userId, values.username!, await hashPassword(password), values.display_name!, mobile, now(),
      ],
      [
        'INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(), spaceId, userId, 'admin', today, values.valid_until!, c.get('user')!.id,
      ],
    ]);
  } catch {
    return renderOwnerSpace(c, spaceId, { error: t('usernameTaken'), values }, 400); // taken in the same instant
  }
  return c.redirect(`/owner/spaces/${spaceId}`);
});

// Called only after the access check for the address has passed.
async function serveLogo(c: C, spaceId: string) {
  const obj = await c.env.FILES.get(logoKey(spaceId));
  if (!obj) return refuse(c, 404, 'notFound');
  const headers = fileHeaders(obj.httpMetadata?.contentType ?? 'application/octet-stream', obj.httpEtag);
  if (c.req.header('if-none-match') === obj.httpEtag) {
    obj.body.cancel();
    return new Response(null, { status: 304, headers });
  }
  return new Response(obj.body, { headers });
}

app.get('/owner/spaces/:id/logo', (c) => serveLogo(c, c.req.param('id')));

// ---------------------------------------------------------------- spaces ----
app.get('/home', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/signin');
  if (user.is_owner) return c.redirect('/owner');
  const spaces = await c.get('db').all<{ id: string; name: string }>(
    'SELECT DISTINCT s.id, s.name FROM membership m JOIN space s ON s.id = m.space_id WHERE m.user_id = ? ORDER BY s.name',
    user.id,
  );
  if (spaces.length === 1) return c.redirect(`/s/${spaces[0].id}`);
  return page(c, membershipsPage(label(c), c.get('lang'), spaces));
});

// Every address inside a space passes this check first: signed in, a member
// of this space, and within the end date. After the end date every address
// answers 403 with the plain "access ended" message.
const ROLE_ORDER = ['admin', 'publisher', 'learner'];

app.use('/s/:spaceId/*', async (c, next) => {
  const user = c.get('user');
  if (!user) return c.redirect('/signin');
  const spaceId = c.req.param('spaceId');
  const rows = await c.get('db').all<{ name: string; json: string; role: string; valid_until: string }>(
    `SELECT s.name, k.json, m.role, m.valid_until
       FROM membership m JOIN space s ON s.id = m.space_id JOIN kit k ON k.id = s.kit_id
      WHERE m.space_id = ? AND m.user_id = ?
      ORDER BY m.valid_until DESC`,
    spaceId, user.id,
  );
  if (!rows.length) return refuse(c, 403, 'noAccess');
  const kit = loadKit(rows[0].json);
  const [first, second] = kit.languages;
  const active = rows.filter((r) => membershipActive(r.valid_until, now()));
  if (!active.length) {
    const last = rows[0];
    const body = accessEndedPage(
      { t: makeLabel(first, kit), lang: first },
      second ? { t: makeLabel(second, kit), lang: second } : null,
      { spaceName: last.name, date: last.valid_until, contactKey: last.role === 'admin' ? 'ownerWord' : 'admin' },
    );
    return page(c, body, 403);
  }
  const rank = (role: string) => (ROLE_ORDER.includes(role) ? ROLE_ORDER.indexOf(role) : ROLE_ORDER.length);
  const main = [...active].sort((x, y) => rank(x.role) - rank(y.role))[0];
  const space: CurrentSpace = {
    id: spaceId, name: main.name, kit, role: main.role, roles: active.map((r) => r.role), validUntil: main.valid_until,
  };
  c.set('space', space);
  c.set('lang', first);
  await next();
});

// Role gates. Admin pages live under /s/<space>/admin, publisher pages under
// /s/<space>/publish. Anyone without that role today gets 403 with the plain
// refusal, before any page is looked up (so unknown addresses there are 403
// too, not 404).
const requireSpaceRole = (role: 'admin' | 'publisher'): MiddlewareHandler<AppEnv> => async (c, next) => {
  if (!c.get('space').roles.includes(role)) return refuse(c, 403, 'noAccess');
  await next();
};
// A pattern ending in /* also matches its own base (…/admin itself).
app.use('/s/:spaceId/admin/*', requireSpaceRole('admin'));
app.use('/s/:spaceId/publish/*', requireSpaceRole('publisher'));

function spaceView(space: CurrentSpace): SpaceView {
  return { id: space.id, name: space.name, primaryColor: space.kit.theme.primaryColor, hasLogo: Boolean(space.kit.theme.logoKey) };
}

function spaceLabel(c: C) {
  const space = c.get('space');
  const lang = space.kit.languages[0];
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
  const subjects = c.get('space').roles.includes('learner') ? await subjectsForLearner(c.get('db'), view.id, user.id) : [];
  return page(c, learnerHome(t, lang, view, user.display_name, subjects));
}

// The space home is the home of the person's main role: an admin gets the
// admin home, a publisher the publisher home, everyone else the learner home.
app.get('/s/:spaceId', (c) => {
  const roles = c.get('space').roles;
  if (roles.includes('admin')) return renderAdminHome(c);
  if (roles.includes('publisher')) return renderPublisherHome(c);
  return renderLearnerHome(c);
});
app.get('/s/:spaceId/admin', (c) => renderAdminHome(c));
app.get('/s/:spaceId/publish', (c) => renderPublisherHome(c));

app.get('/s/:spaceId/logo', (c) => serveLogo(c, c.get('space').id));

// Reading: a subject, a lesson, a stored file. Anything the person may not
// read here (another space's id, a subject not assigned, unpublished, or no
// such id) answers the same 403, so an address reveals nothing.
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
  const subject = lesson && (await readableSubject(db, space, c.get('user')!.id, lesson.subject_id));
  if (!lesson || !subject) return refuse(c, 403, 'noAccess');
  const { t, lang, view } = spaceLabel(c);
  const materials = await lessonMaterials(db, space.id, lesson.id);
  return page(c, lessonPage(t, lang, view, { subject, lesson, materials }));
});

app.get('/s/:spaceId/file/:materialId', async (c) => {
  const db = c.get('db');
  const space = c.get('space');
  const file = await findFile(db, space.id, c.req.param('materialId'));
  const subject = file && (await readableSubject(db, space, c.get('user')!.id, file.subject_id));
  if (!file || !subject) return refuse(c, 403, 'noAccess');
  const obj = await c.env.FILES.get(file.storage_key);
  if (!obj) return refuse(c, 404, 'notFound');
  const headers = materialFileHeaders(file.kind, obj.httpMetadata?.contentType ?? '', obj.httpEtag);
  if (c.req.header('if-none-match') === obj.httpEtag) {
    obj.body.cancel();
    return new Response(null, { status: 304, headers });
  }
  return new Response(obj.body, { headers });
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

async function renderSubjectEditor(c: C, subject: SubjectRow, error?: LabelKey) {
  const { t, lang, view } = spaceLabel(c);
  const parts = await outline(c.get('db'), view.id, subject.id);
  return page(c, subjectEditor(t, lang, view, subject, parts, error && t(error)), error ? 400 : 200);
}

async function renderLessonEditor(c: C, lesson: EditableLesson, error?: LabelKey, status: 200 | 400 | 413 = 200) {
  const db = c.get('db');
  const { t, lang, view } = spaceLabel(c);
  const subject = await editableSubject(db, view.id, c.get('user')!.id, lesson.subject_id);
  if (!subject) return refuse(c, 403, 'noAccess');
  const materials = await lessonMaterials(db, view.id, lesson.id);
  return page(c, lessonEditor(t, lang, view, { subject, lesson, materials, error: error && t(error) }), status);
}

app.get('/s/:spaceId/publish/edit/:subjectId', async (c) => {
  const subject = await editableSubject(c.get('db'), c.get('space').id, c.get('user')!.id, c.req.param('subjectId'));
  if (!subject) return refuse(c, 403, 'noAccess');
  return renderSubjectEditor(c, subject);
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
  if (!lesson) return refuse(c, 403, 'noAccess');
  return renderLessonEditor(c, lesson);
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

// ------------------------------------------------------------ my account ----
// Everyone can change their own password. The page follows the language of the
// person's space (their latest membership), else the browser's.
async function accountLang(c: C): Promise<Lang> {
  const row = await c.get('db').first<{ json: string }>(
    `SELECT k.json FROM membership m JOIN space s ON s.id = m.space_id JOIN kit k ON k.id = s.kit_id
      WHERE m.user_id = ? ORDER BY m.valid_until DESC LIMIT 1`,
    c.get('user')!.id,
  );
  return row ? loadKit(row.json).languages[0] : c.get('lang');
}

app.use('/account/*', async (c, next) => {
  if (!c.get('user')) return c.redirect('/signin');
  c.set('lang', await accountLang(c));
  await next();
});

function renderAccount(c: C, extra: { error?: string; done?: boolean } = {}, status: 200 | 400 = 200) {
  const user = c.get('user')!;
  return page(c, accountPage(label(c), c.get('lang'), { displayName: user.display_name, username: user.username, ...extra }), status);
}

app.get('/account', (c) => renderAccount(c));

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
    ['UPDATE user SET password_hash = ? WHERE id = ?', await hashPassword(next), user.id],
    ['DELETE FROM session WHERE user_id = ? AND id <> ?', user.id, user.sessionId], // every other sign-in ends
  ]);
  return renderAccount(c, { done: true });
});

// ------------------------------------------------------- not found, errors ----
app.notFound((c) => {
  const space = c.var.space;
  const lang = space ? space.kit.languages[0] : c.get('lang') ?? 'en';
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
  console.error(err);
  return page(c, messagePage(t, lang, t('serverError'), false), 500);
});

