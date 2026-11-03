// AT-9a (contract product-contract-r2, R2-a): the admin appoints a guardian:
// name, username, first password, end date, registered mobile number. A
// guardian end date later than the admin's own is refused. The admin's real
// people page in Chromium at phone width, Arabic first; screenshots go to
// evidence/at-9/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { utcDatePlusDays } from '../support/http.ts';
import { verifyPassword } from '../../src/auth/password.ts';
import { assertPage, phone, readable, shot, signIn, submit } from '../support/browser.ts';
import { ADMIN, G1, G2, buildWorld, personPath, type World } from './world.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-9/', import.meta.url));
let w: World;
let browser: Browser;
const count = async (sql: string) => Number((await w.p.sql(sql))[0].n);

describe('AT-9a the admin appoints a guardian; an end date past the admin\'s own is refused', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await buildWorld();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('through the admin\'s people page: name, username, first password, end date and mobile; stored as a guardian of this space', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, ADMIN.username, ADMIN.password);
    await ph.page.goto(w.p.url + `/s/${w.spaceId}/admin/people`);
    await assertPage(ph.page, 'people page (Arabic)', 'ar');
    const options = await ph.page.locator('form#appoint select[name=role] option').evaluateAll((els) => els.map((e) => [e.getAttribute('value'), e.textContent?.trim()]));
    assert.deepEqual(options, [['publisher', 'معلّم'], ['learner', 'طالب'], ['guardian', 'ولي أمر']], 'the role choice offers the kit\'s guardian word');
    const end = utcDatePlusDays(30);
    await ph.page.fill('form#appoint input[name=display_name]', G1.display_name);
    await ph.page.fill('form#appoint input[name=username]', G1.username);
    await ph.page.fill('form#appoint input[name=password]', G1.password);
    await ph.page.selectOption('form#appoint select[name=role]', 'guardian');
    await ph.page.fill('form#appoint input[name=mobile]', G1.mobile);
    await ph.page.fill('form#appoint input[name=valid_until]', end);
    await shot(ph.page, EVIDENCE, '9a-1-appoint-guardian-ar');
    assert.equal(await submit(ph.page, 'form#appoint'), 303, 'appointed');
    const row = (await w.p.sql(`SELECT u.id, u.display_name, u.mobile, u.password_hash, m.role, m.valid_until, m.space_id
      FROM user u JOIN membership m ON m.user_id = u.id WHERE u.username = '${G1.username}'`));
    assert.equal(row.length, 1, 'one membership');
    assert.equal(row[0].role, 'guardian');
    assert.equal(row[0].space_id, w.spaceId);
    assert.equal(row[0].display_name, G1.display_name);
    assert.equal(row[0].valid_until, end);
    assert.equal(row[0].mobile, '+201041414141', 'the registered mobile, in international form');
    assert.ok(await verifyPassword(G1.password, String(row[0].password_hash)), 'the first password');
    const listed = await readable(ph.page);
    assert.ok(listed.includes(G1.display_name) && listed.includes('ولي أمر') && listed.includes('4141'), 'listed with the kit word and the last digits');
    assert.ok(!listed.includes('1041414141'), 'the number shows only as its last digits');
    await shot(ph.page, EVIDENCE, '9a-2-guardian-listed-ar');
    // The guardian's own page, as for any person the admin appointed.
    await ph.page.goto(w.p.url + personPath(w, String(row[0].id)));
    assert.ok((await readable(ph.page)).includes('ولي أمر'), 'the person page names the role');
    await ph.ctx.close();
  });

  it('a guardian end date later than the admin\'s own is refused, and nothing is stored', async () => {
    const users = await count('SELECT COUNT(*) AS n FROM user');
    const memberships = await count('SELECT COUNT(*) AS n FROM membership');
    const beyond = new Date(Date.parse(w.adminEnd + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);
    const res = await w.admin.post(`/s/${w.spaceId}/admin/people`, { ...G2, valid_until: beyond });
    assert.equal(res.status, 400);
    assert.ok((await res.text()).includes(`لا يمكن أن يتجاوز تاريخ الانتهاء تاريخ انتهائك أنت، ${w.adminEnd}.`), 'the plain refusal names the admin\'s own end date');
    assert.equal(await count('SELECT COUNT(*) AS n FROM user'), users, 'no account');
    assert.equal(await count('SELECT COUNT(*) AS n FROM membership'), memberships, 'no membership');
    // Exactly the admin's own end date is allowed.
    assert.equal((await w.admin.post(`/s/${w.spaceId}/admin/people`, { ...G2, valid_until: w.adminEnd })).status, 303);
    assert.equal((await w.p.sql(`SELECT m.valid_until FROM membership m JOIN user u ON u.id = m.user_id WHERE u.username = '${G2.username}'`))[0].valid_until, w.adminEnd);
  });

  it('a role other than publisher, learner or guardian is still refused, with the plain message naming all three', async () => {
    const res = await w.admin.post(`/s/${w.spaceId}/admin/people`, { ...G2, username: 'someone.else', role: 'admin', valid_until: utcDatePlusDays(10) });
    assert.equal(res.status, 400);
    assert.ok((await res.text()).includes('يمكنك تعيين معلّم أو طالب أو ولي أمر فقط.'));
    assert.equal(await count("SELECT COUNT(*) AS n FROM user WHERE username = 'someone.else'"), 0);
  });
});
