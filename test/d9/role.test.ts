// LMS-D9 (owner decision D9, 27 Nov 2026; task PIL-320): when an admin
// appoints a person, the role is chosen on purpose and the confirmation names
// it; a wrong role has one documented route and no new way to change data.
// One test per criterion part (D9 R-1.1 to D9 R-4.1); each CI step selects its
// test by name. Built on the wave 1 world (Mesk School with the School kit,
// Delta Logistics with the Company kit; Amal and Basem are their admins).
// Screenshots of the form (empty, refused, confirmed) in Arabic at 390, 768 and
// 1280 px go to evidence/d9/. Made-up names and numbers only (0105 range).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { utcDatePlusDays } from '../support/http.ts';
import { ADMIN, COMPANY_ADMIN, WIDTHS, as, browserAs, plain, wave1World, type Wave1World, type Width } from '../wave1/world.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/d9/', import.meta.url));
async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE}${name}.png`, fullPage: true });
}

// The wording (src/i18n/ui.ts), with each kit's own role words.
const CHOOSE = { ar: 'اختر الدور', en: 'Choose a role' };
const REQUIRED = {
  school: { ar: 'اختر الدور: معلّم أو طالب أو ولي أمر.', en: 'Choose the role: Teacher, Student or Parent.' },
  company: { ar: 'اختر الدور: مدرّب أو موظّف أو مشرف.', en: 'Choose the role: Trainer, Employee or Supervisor.' },
};
const HELP = {
  ar: 'دور خاطئ؟ افتح صفحة الشخص وحدّد تاريخ انتهاء في «تصحيح البيانات»، ثم عيّنه من جديد بالدور الصحيح واسم مستخدم جديد.',
  en: 'Wrong role? Open the person and set an end date under “Correct the details”, then appoint them again with the right role and a new username.',
};
const appointed = (lang: 'ar' | 'en', name: string, role: string) => (lang === 'ar' ? `تم تعيين ${name}، الدور: ${role}.` : `Appointed ${name}, role: ${role}.`);

let w: Wave1World;
let browser: Browser;
before(async () => {
  w = await wave1World();
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await w?.close();
});

const peoplePath = (spaceId: string) => `/s/${spaceId}/admin/people`;
let serial = 0;
/** A new made-up person's typed values (no role). */
function typed(name: string): Record<string, string> {
  serial += 1;
  return {
    display_name: name, username: `d9.person${serial}`, password: 'd9-first-pass', mobile: `010500000${String(serial).padStart(2, '0')}`, valid_until: utcDatePlusDays(20),
  };
}
const count = async (sql: string) => Number((await w.p.sql(sql))[0].n);
const peopleRows = () => count('SELECT (SELECT COUNT(*) FROM user) + (SELECT COUNT(*) FROM membership) AS n');

/** The opening tag of the element with this id, and the element's text. */
function byId(html: string, id: string): { tag: string; text: string } | null {
  const open = new RegExp(`<([a-z]+)[^>]*\\bid="${id}"[^>]*>`).exec(html);
  if (!open) return null;
  const end = html.indexOf(`</${open[1]}>`, open.index);
  // <bdi> isolates a value inside the sentence: it adds no space of its own.
  return { tag: open[0], text: plain(html.slice(open.index, end + open[1].length + 3).replace(/<\/?bdi[^>]*>/g, '')) };
}

/** The role field of the appoint form: the select's opening tag, its options, and what follows it inside its label. */
function roleField(html: string): { select: string; options: { value: string; tag: string; text: string }[]; label: string } {
  const form = /<form id="appoint"[\s\S]*?<\/form>/.exec(html)?.[0] ?? '';
  const label = /<label>[^<]*<select name="role"[\s\S]*?<\/label>/.exec(form)?.[0] ?? '';
  const select = /<select name="role"[^>]*>/.exec(label)?.[0] ?? '';
  const options = [...label.matchAll(/(<option[^>]*>)([^<]*)<\/option>/g)].map((m) => ({ value: /value="([^"]*)"/.exec(m[1])?.[1] ?? '', tag: m[1], text: m[2].trim() }));
  return { select, options, label };
}

describe('D9 R-1', { concurrency: false }, () => {
  it('D9 R-1.1 the role field starts on an empty, disabled "Choose a role" and no role is chosen, in both kits and both languages', async () => {
    for (const [admin, spaceId, kit] of [[ADMIN, w.school.id, 'school'], [COMPANY_ADMIN, w.company.id, 'company']] as const) {
      for (const lang of ['ar', 'en'] as const) {
        const c = await as(w, admin, lang);
        const html = await (await c.get(peoplePath(spaceId))).text();
        const f = roleField(html);
        assert.ok(f.select, `${kit} ${lang}: the form has the role field`);
        assert.match(f.select, /\brequired\b/, `${kit} ${lang}: the field is required`);
        assert.deepEqual(f.options.map((o) => o.value), ['', 'publisher', 'learner', 'guardian'], `${kit} ${lang}: the placeholder first, then the three roles`);
        const [first, ...roles] = f.options;
        assert.equal(first.text, CHOOSE[lang], `${kit} ${lang}: the placeholder says ${CHOOSE[lang]}`);
        assert.match(first.tag, /\bdisabled\b/, `${kit} ${lang}: the placeholder cannot be chosen`);
        assert.match(first.tag, /\bselected\b/, `${kit} ${lang}: the placeholder is what the field shows`);
        for (const o of roles) assert.doesNotMatch(o.tag, /\bselected\b/, `${kit} ${lang}: ${o.value} is not preselected`);
      }
    }
    // In a real browser the field's value is empty until a role is chosen, and the browser itself asks for one.
    const tab = await browserAs(browser, w, ADMIN, { lang: 'ar' });
    try {
      await tab.page.goto(w.p.url + peoplePath(w.school.id));
      assert.equal(await tab.page.locator('form#appoint select[name=role]').inputValue(), '', 'no role chosen');
      assert.equal(await tab.page.locator('form#appoint select[name=role]').evaluate((s) => (s as HTMLSelectElement).validity.valueMissing), true, 'the browser asks for a role');
      for (const width of Object.keys(WIDTHS) as Width[]) {
        await tab.page.setViewportSize(WIDTHS[width]);
        await tab.page.locator('form#appoint').scrollIntoViewIfNeeded();
        assert.equal(await tab.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `${width}: no sideways scroll`);
        await shot(tab.page, `D9-form-empty-${width}-ar`);
      }
    } finally {
      await tab.ctx.close();
    }
  });

  it('D9 R-1.2 appointing without a role is refused next to the field, keeps what was typed and saves nobody', async () => {
    for (const [admin, spaceId, kit] of [[ADMIN, w.school.id, 'school'], [COMPANY_ADMIN, w.company.id, 'company']] as const) {
      for (const lang of ['ar', 'en'] as const) {
        const c = await as(w, admin, lang);
        for (const role of [undefined, '']) {
          const v = typed(lang === 'ar' ? 'سارة اختبار' : 'Sara Test');
          const before = await peopleRows();
          const res = await c.post(peoplePath(spaceId), role === undefined ? v : { ...v, role });
          assert.equal(res.status, 400, `${kit} ${lang} role ${JSON.stringify(role)}: refused`);
          const html = await res.text();
          const f = roleField(html);
          // The message is inside the field's own label, right after the select, and the select points at it.
          const error = byId(f.label, 'error');
          assert.ok(error, `${kit} ${lang}: the message is next to the role field`);
          assert.equal(error.text, REQUIRED[kit][lang]);
          assert.match(error.tag, /role="alert"/, 'announced');
          assert.match(f.select, /aria-describedby="error"/, 'the field is described by the message');
          assert.match(f.select, /aria-invalid="true"/, 'the field is marked invalid');
          assert.equal((html.match(/id="error"/g) ?? []).length, 1, 'one message only');
          // What was typed is kept (but the password, which is never sent back).
          for (const name of ['display_name', 'username', 'mobile', 'valid_until']) {
            assert.match(html, new RegExp(`name="${name}"[^>]*value="${v[name].replace(/[.+]/g, '\\$&')}"`), `${kit} ${lang}: ${name} kept`);
          }
          assert.ok(!html.includes(v.password), 'the password is not sent back');
          assert.match(f.options[0].tag, /\bselected\b/, 'the field still shows Choose a role');
          assert.equal(await count(`SELECT COUNT(*) AS n FROM user WHERE username = '${v.username}'`), 0, 'nobody saved');
          assert.equal(await peopleRows(), before, 'no row written');
        }
      }
    }
  });

  it('D9 R-1.3 in a real browser (Arabic, right to left) the refusal is announced on the role field at phone, tablet and desktop widths', async () => {
    for (const width of Object.keys(WIDTHS) as Width[]) {
      const tab = await browserAs(browser, w, ADMIN, { lang: 'ar', width });
      try {
        const page = tab.page;
        await page.goto(w.p.url + peoplePath(w.school.id));
        const v = typed('سارة اختبار');
        for (const name of ['display_name', 'username', 'password', 'mobile', 'valid_until']) await page.fill(`form#appoint input[name=${name}]`, v[name]);
        // The browser's own check set aside, so the server's refusal is what shows.
        await page.locator('form#appoint').evaluate((f) => { (f as HTMLFormElement).noValidate = true; });
        await Promise.all([page.waitForEvent('load'), page.click('form#appoint button[type=submit]')]);
        assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
        const select = page.locator('form#appoint select[name=role]');
        const described = await select.evaluate((s) => (s.getAttribute('aria-describedby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' '));
        assert.equal(described, REQUIRED.school.ar, `${width}: the field's description is the message`);
        assert.equal(await page.locator('#error').isVisible(), true);
        assert.equal(await page.inputValue('form#appoint input[name=display_name]'), v.display_name, 'the name is kept');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `${width}: no sideways scroll`);
        await page.locator('#error').scrollIntoViewIfNeeded();
        await shot(page, `D9-form-error-${width}-ar`);
        assert.equal(await count(`SELECT COUNT(*) AS n FROM user WHERE username = '${v.username}'`), 0, 'nobody saved');
      } finally {
        await tab.ctx.close();
      }
    }
  });
});

describe('D9 R-2', { concurrency: false }, () => {
  it('D9 R-2.1 after Appoint, the page names the person and the role given in the kit\'s words, in Arabic and English', async () => {
    for (const [admin, spaceId, kit] of [[ADMIN, w.school.id, 'school'], [COMPANY_ADMIN, w.company.id, 'company']] as const) {
      for (const lang of ['ar', 'en'] as const) {
        for (const role of ['learner', 'publisher'] as const) {
          const c = await as(w, admin, lang);
          const v = typed(lang === 'ar' ? 'منى اختبار' : 'Mona Check');
          const res = await c.post(peoplePath(spaceId), { ...v, role });
          assert.equal(res.status, 303, `${kit} ${lang} ${role}: appointed`);
          const id = String((await w.p.sql(`SELECT id FROM user WHERE username = '${v.username}'`))[0].id);
          const stored = String((await w.p.sql(`SELECT role FROM membership WHERE user_id = '${id}' AND space_id = '${spaceId}'`))[0].role);
          assert.equal(stored, role, 'the role chosen is the role stored');
          const to = res.headers.get('location') ?? '';
          assert.equal(to, `/s/${spaceId}/admin/people?added=${id}#done`, 'back to the people page, naming whom');
          const html = await (await c.get(to.replace(/#.*$/, ''))).text();
          const done = byId(html, 'done');
          assert.ok(done, `${kit} ${lang} ${role}: a confirmation`);
          const word = { school: { ar: { learner: 'طالب', publisher: 'معلّم' }, en: { learner: 'Student', publisher: 'Teacher' } }, company: { ar: { learner: 'موظّف', publisher: 'مدرّب' }, en: { learner: 'Employee', publisher: 'Trainer' } } }[kit][lang][role];
          assert.equal(done.text, appointed(lang, v.display_name, word), `${kit} ${lang} ${role}`);
          assert.match(done.tag, /role="status"/, 'announced');
        }
      }
    }
    // Without a person of this space, nothing is confirmed: another space's person, a made-up id.
    const amal = await as(w, ADMIN, 'en');
    const other = String((await w.p.sql(`SELECT user_id AS id FROM membership WHERE space_id = '${w.company.id}'
      AND user_id NOT IN (SELECT user_id FROM membership WHERE space_id = '${w.school.id}') LIMIT 1`))[0].id);
    for (const id of [other, 'made-up-id', '']) {
      const html = await (await amal.get(`${peoplePath(w.school.id)}?added=${encodeURIComponent(id)}`)).text();
      assert.equal(byId(html, 'done'), null, `no confirmation for ${JSON.stringify(id)}`);
    }
    // In a browser, in Arabic: the confirmation at the three widths.
    for (const width of Object.keys(WIDTHS) as Width[]) {
      const tab = await browserAs(browser, w, ADMIN, { lang: 'ar', width });
      try {
        const page = tab.page;
        await page.goto(w.p.url + peoplePath(w.school.id));
        const v = typed('ليلى اختبار');
        for (const name of ['display_name', 'username', 'password', 'mobile', 'valid_until']) await page.fill(`form#appoint input[name=${name}]`, v[name]);
        await page.selectOption('form#appoint select[name=role]', 'learner');
        await Promise.all([page.waitForEvent('load'), page.click('form#appoint button[type=submit]')]);
        assert.equal((await page.locator('#done').innerText()).trim(), appointed('ar', v.display_name, 'طالب'));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `${width}: no sideways scroll`);
        await shot(page, `D9-confirmation-${width}-ar`);
      } finally {
        await tab.ctx.close();
      }
    }
  });
});

describe('D9 R-3', { concurrency: false }, () => {
  it('D9 R-3.1 the people page says how to fix a wrong role, in both languages, and that route works with no new way to change a role', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const html = await (await (await as(w, ADMIN, lang)).get(peoplePath(w.school.id))).text();
      const help = byId(html, 'role-help');
      assert.ok(help, `${lang}: the help line`);
      assert.equal(help.text, HELP[lang]);
      assert.ok(html.indexOf('id="role-help"') > html.indexOf('id="appoint"') - 2000 && html.indexOf('id="role-help"') < html.indexOf('</form>', html.indexOf('id="appoint"')), `${lang}: the line is with the appoint form`);
    }
    // The route: a wrong role (a learner saved as a publisher), then an end date with Correct the details, then a new appointment.
    const amal = await as(w, ADMIN, 'en');
    const wrong = typed('Hana Wrong');
    assert.equal((await amal.post(peoplePath(w.school.id), { ...wrong, role: 'publisher' })).status, 303);
    const id = String((await w.p.sql(`SELECT id FROM user WHERE username = '${wrong.username}'`))[0].id);
    const person = `${peoplePath(w.school.id)}/${id}`;
    // Correct the details cannot change a role, and no address changes one.
    const roleOf = async () => String((await w.p.sql(`SELECT role FROM membership WHERE user_id = '${id}'`))[0].role);
    assert.equal((await amal.post(`${person}/correct`, { display_name: wrong.display_name, mobile: '', valid_until: wrong.valid_until, role: 'learner' })).status, 303);
    assert.equal(await roleOf(), 'publisher', 'a role field sent to Correct the details changes nothing');
    for (const sub of ['/role', '/change-role']) {
      const res = await amal.post(`${person}${sub}`, { role: 'learner' });
      assert.ok([403, 404, 405].includes(res.status), `${sub} is not an address (${res.status})`);
    }
    assert.equal(await roleOf(), 'publisher');
    const today = utcDatePlusDays(0);
    assert.equal((await amal.post(`${person}/correct`, { display_name: wrong.display_name, mobile: '', valid_until: today })).status, 303, 'the end date set to today');
    assert.equal(String((await w.p.sql(`SELECT valid_until FROM membership WHERE user_id = '${id}'`))[0].valid_until), today);
    const right = { ...typed('Hana Right'), display_name: wrong.display_name };
    const res = await amal.post(peoplePath(w.school.id), { ...right, role: 'learner' });
    assert.equal(res.status, 303, 'appointed again with the right role and a new username');
    const again = String((await w.p.sql(`SELECT m.role FROM membership m JOIN user u ON u.id = m.user_id WHERE u.username = '${right.username}'`))[0].role);
    assert.equal(again, 'learner');
    // The same username cannot be used again (why the line asks for a new one).
    assert.equal((await amal.post(peoplePath(w.school.id), { ...wrong, role: 'learner' })).status, 400);
  });
});

describe('D9 R-4', { concurrency: false }, () => {
  it('D9 R-4.1 the server still accepts only the three roles: admin, owner or a made-up role is refused and nothing is saved', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const amal = await as(w, ADMIN, lang);
      for (const role of ['admin', 'owner', 'teacher', 'PUBLISHER', 'learner,admin']) {
        const v = typed('Refused Role');
        const before = await peopleRows();
        const res = await amal.post(peoplePath(w.school.id), { ...v, role });
        assert.equal(res.status, 400, `${role}: refused`);
        const html = await res.text();
        const error = byId(roleField(html).label, 'error');
        assert.ok(error, `${role}: the message is next to the role field`);
        assert.equal(error.text, lang === 'ar' ? 'يمكنك تعيين معلّم أو طالب أو ولي أمر فقط.' : 'You can appoint a Teacher, a Student or a Parent only.');
        assert.equal(await peopleRows(), before, `${role}: nothing saved`);
      }
      // Each of the three roles is still accepted.
      for (const role of ['publisher', 'learner', 'guardian']) {
        assert.equal((await amal.post(peoplePath(w.school.id), { ...typed('Allowed Role'), role })).status, 303, `${role}: appointed`);
      }
    }
  });
});
