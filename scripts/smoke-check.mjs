#!/usr/bin/env node
// Smoke check after a deploy:   node scripts/smoke-check.mjs https://<address>
//
// It reads only, and proves four things about the live address:
//   1. the home page redirects to /setup (no owner yet) or /signin on the
//      same origin; a 200 or any other answer fails;
//   2. that page itself answers 200;
//   3. a form post from another site is refused with 403 (the cross-origin
//      guard is live), and so is one from the same host over plain http;
//   4. the test hooks are absent: /__test/clock is 404 (not a test build).
// The first request is retried for up to SMOKE_WAIT_SECONDS (default 120),
// because a brand-new workers.dev address can take a moment to answer.
// Exit code 0 when all four hold, 1 otherwise, with a plain message.

const FOREIGN_ORIGIN = 'https://cross-origin-check.invalid';

async function fetchWithRetry(url, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1000;
  let last = '';
  for (;;) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return res;
      last = `status ${res.status}`;
    } catch (err) {
      last = String(err?.cause?.code ?? err?.message ?? err);
    }
    if (Date.now() >= deadline) throw new Error(`${url} did not answer in ${waitSeconds}s (${last})`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export async function smokeCheck(address, { waitSeconds = 120, log = console.log } = {}) {
  const base = new URL(address).origin;
  const failures = [];
  const check = (ok, good, bad) => {
    if (ok) log(`ok   ${good}`);
    else { log(`FAIL ${bad}`); failures.push(bad); }
  };

  const home = await fetchWithRetry(base + '/', waitSeconds);
  await home.body?.cancel();
  const location = home.headers.get('location') ?? '';
  const target = location ? new URL(location, base) : null;
  const redirectOk = [301, 302, 303, 307, 308].includes(home.status) && target?.origin === base && ['/setup', '/signin'].includes(target.pathname);
  check(redirectOk,
    `GET / answers ${home.status}${location ? ` -> ${target?.pathname}` : ''}`,
    `GET / answered ${home.status}${location ? ` -> ${location}` : ''}; expected a redirect to /setup or /signin`);
  if (target?.pathname === '/setup') log('     No owner yet: the owner must open the address and complete first setup now.');

  if (redirectOk) {
    const page = await fetch(target.href, { redirect: 'manual' });
    await page.body?.cancel();
    check(page.status === 200, `GET ${target.pathname} answers 200`, `GET ${target.pathname} answered ${page.status}; expected 200`);
  }

  const forge = async (origin) => {
    const res = await fetch(base + '/signin', {
      method: 'POST',
      redirect: 'manual',
      headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'username=smoke-check&password=smoke-check',
    });
    await res.body?.cancel();
    return res.status;
  };
  const forged = await forge(FOREIGN_ORIGIN);
  check(forged === 403, 'a cross-origin POST is refused with 403', `a cross-origin POST answered ${forged}; expected 403`);
  // The same host over plain http is another origin too. Checked on the live
  // https address only: locally, wrangler dev's proxy rewrites same-host origins.
  if (base.startsWith('https://')) {
    const plain = await forge(base.replace(/^https:/, 'http:'));
    check(plain === 403, 'a POST from the same host over http is refused with 403', `a POST from the same host over http answered ${plain}; expected 403`);
  } else {
    log('skip a POST from the same host over http: skipped (the address is not https)');
  }

  const hook = await fetch(base + '/__test/clock', { redirect: 'manual' });
  await hook.body?.cancel();
  check(hook.status === 404, 'the test hooks are absent (/__test/clock is 404)', `/__test/clock answered ${hook.status}; expected 404 (a test build must never be deployed)`);

  return failures;
}

async function main() {
  const address = process.argv[2];
  if (!address || !/^https?:\/\//.test(address)) {
    console.error('usage: node scripts/smoke-check.mjs https://<address>');
    process.exit(2);
  }
  const waitSeconds = Number(process.env.SMOKE_WAIT_SECONDS ?? 120);
  try {
    const failures = await smokeCheck(address, { waitSeconds });
    if (failures.length) {
      console.error(`Smoke check FAILED (${failures.length}). Roll back with "npx wrangler rollback" or in the Cloudflare dashboard (README, "First deploy").`);
      process.exit(1);
    }
    console.log(`Smoke check passed for ${new URL(address).origin}`);
  } catch (err) {
    console.error(`Smoke check FAILED: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  await main();
}
