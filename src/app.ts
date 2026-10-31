// LMS Lego router: server-rendered pages on Hono.
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { csrf } from 'hono/csrf';
import type { AppEnv, CurrentSpace } from './app-env.ts';
import { isIsoDate, membershipActive, utcDate } from './access.ts';
import { dummyHash, hashPassword, verifyPassword } from './auth/password.ts';
import { SESSION_COOKIE, SESSION_IDLE_MS, sessionDecision } from './auth/session.ts';
import { newRecoveryCode, randomToken, recoveryCodeHash, tokenHash } from './auth/tokens.ts';
import { now } from './clock.ts';
import { Db } from './db.ts';
import { LOGO_MAX_BYTES, fileHeaders, sniffLogo } from './files.ts';
import { makeLabel, productLang, type KitJson, type Lang } from './labels.ts';
import { normaliseCountryCode, normaliseMobile } from './phone.ts';
import { SEED_KITS, seedKit } from './kits/seed.ts';
import { registerTestHooks } from './test-hooks.ts';
import { FREE_PLAN, UsageMeter, type FlushBatch } from './usage.ts';
import { recoverPage, recoveryCodePage, setupPage, signInPage } from './views/auth.ts';
import { messagePage, type Html } from './views/layout.ts';
import { newSpacePage, ownerHome, ownerSpacePage, type AdminRow, type AppointValues, type NewSpaceValues } from './views/owner.ts';
import { accessEndedPage, adminHome, membershipsPage } from './views/space.ts';

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

function page(c: C, body: Html, status: 200 | 400 | 401 | 403 | 404 | 500 = 200) {
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
app.use('/s/:spaceId/*', async (c, next) => {
  const user = c.get('user');
  if (!user) return c.redirect('/signin');
  const spaceId = c.req.param('spaceId');
  const row = await c.get('db').first<{ name: string; json: string; role: string; valid_until: string }>(
    `SELECT s.name, k.json, m.role, m.valid_until
       FROM membership m JOIN space s ON s.id = m.space_id JOIN kit k ON k.id = s.kit_id
      WHERE m.space_id = ? AND m.user_id = ?
      ORDER BY m.valid_until DESC LIMIT 1`,
    spaceId, user.id,
  );
  if (!row) return refuse(c, 403, 'noAccess');
  const kit = loadKit(row.json);
  const [first, second] = kit.languages;
  if (!membershipActive(row.valid_until, now())) {
    const body = accessEndedPage(
      { t: makeLabel(first, kit), lang: first },
      second ? { t: makeLabel(second, kit), lang: second } : null,
      { spaceName: row.name, date: row.valid_until, contactKey: row.role === 'admin' ? 'ownerWord' : 'admin' },
    );
    return page(c, body, 403);
  }
  const space: CurrentSpace = { id: spaceId, name: row.name, kit, role: row.role, validUntil: row.valid_until };
  c.set('space', space);
  c.set('lang', first);
  await next();
});

app.get('/s/:spaceId', (c) => {
  const space = c.get('space');
  const lang = space.kit.languages[0];
  const view = { id: space.id, name: space.name, primaryColor: space.kit.theme.primaryColor, hasLogo: Boolean(space.kit.theme.logoKey) };
  return page(c, adminHome(makeLabel(lang, space.kit), lang, view, c.get('user')!.display_name));
});

app.get('/s/:spaceId/logo', (c) => serveLogo(c, c.get('space').id));

// ------------------------------------------------------- not found, errors ----
app.notFound((c) => {
  const space = c.var.space;
  const lang = space ? space.kit.languages[0] : c.get('lang') ?? 'en';
  const t = makeLabel(lang, space?.kit);
  return page(c, messagePage(t, lang, t('notFound'), Boolean(c.var.user)), 404);
});

app.onError((err, c) => {
  console.error(err);
  const t = makeLabel(c.var.lang ?? 'en');
  return page(c, messagePage(t, c.var.lang ?? 'en', t('serverError'), false), 500);
});

