// LMS redesign wave R1a (product-contract v2 and ux-plan on PIL-322): what the
// learner home, My subjects, to-do and the shell look like in a real browser
// (Chromium), in the seeded world (school colour #E9A020, 8 subjects for سلمى).
// Each test name starts with the item it proves, so each is its own CI step
// (--test-name-pattern). Screenshots go to evidence/ux/UX-<n>-<phone|tablet|desktop>.png
// (evidence only, not the gate).
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { ADMIN, AHMED, HOME, ID, LAILA, MATH, OMAR, OWNER, SALMA, SUBJECTS_PAGE, TODO_PAGE, r1aWorld, type Person, type R1aWorld } from './world.ts';
import { contrast } from '../../src/look.ts';

const UX = 'evidence/ux/';
const PHONE = { width: 375, height: 812 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 900 };
const WIDTHS = [320, 375, 768, 1280];
const FONT = 'IBM Plex Sans Arabic';

let w: R1aWorld;
let browser: Browser;
const contexts: BrowserContext[] = [];

/** A signed-in page of a person at a viewport (a fresh browser context each, so nothing leaks between widths). */
async function as(who: Person | null, viewport: { width: number; height: number }, opts: { reducedMotion?: 'reduce' | 'no-preference' } = {}): Promise<{ page: Page; hosts: Set<string> }> {
  const ctx = await browser.newContext({ viewport, locale: 'ar-EG', reducedMotion: opts.reducedMotion ?? 'no-preference' });
  ctx.setDefaultTimeout(20_000);
  contexts.push(ctx);
  const page = await ctx.newPage();
  const hosts = new Set<string>();
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'http:' || u.protocol === 'https:') hosts.add(u.host);
  });
  if (who) {
    await page.goto(w.url + '/signin');
    await page.fill('form#signin input[name=username]', who.username);
    await page.fill('form#signin input[name=password]', who.password);
    await Promise.all([page.waitForEvent('load'), page.click('form#signin button[type=submit]')]);
  }
  return { page, hosts };
}

async function visit(page: Page, path: string): Promise<void> {
  const res = await page.goto(w.url + path);
  assert.equal(res?.status(), 200, `${path} answers 200`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${UX}${name}.png`, fullPage: true });

/** "rgb(a, b, c)" / "rgba(…)" → "#rrggbb". */
const hex = (rgb: string) => '#' + (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('');

/** The text colour of an element and the first opaque background behind it (itself or an ancestor; the page white past the root). */
async function colours(page: Page, selector: string): Promise<{ fg: string; bg: string; border: string }> {
  const got = await page.locator(selector).first().evaluate((el) => {
    let bg = 'rgb(255, 255, 255)';
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      const a = /rgba\([^)]*,\s*([\d.]+)\)/.exec(c);
      if (c !== 'transparent' && (!a || Number(a[1]) > 0.99)) {
        bg = c;
        break;
      }
    }
    const s = getComputedStyle(el);
    return { fg: s.color, bg, border: s.borderTopColor };
  });
  return { fg: hex(got.fg), bg: hex(got.bg), border: hex(got.border) };
}

/** The element's box in page coordinates. */
const box = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height, top: r.top, bottom: r.bottom + scrollY, left: r.left, right: r.right };
});

async function sideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** What sticks out sideways (for the failure message). */
const wide = (page: Page) => page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => {
  const r = e.getBoundingClientRect();
  return r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1);
}).slice(-4).map((e) => `${e.tagName.toLowerCase()}#${e.id}.${(e as HTMLElement).className} ${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)}`).join("; "));

/** How many cards share the first row of #my-list. */
const perRow = (page: Page) => page.evaluate(() => {
  const tops = [...document.querySelectorAll('#my-list > li[data-subject]')].map((li) => Math.round(li.getBoundingClientRect().top));
  return tops.filter((t) => t === tops[0]).length;
});

before(async () => {
  mkdirSync(UX, { recursive: true });
  w = await r1aWorld();
  browser = await chromium.launch();
});
after(async () => {
  for (const c of contexts) await c.close().catch(() => undefined);
  await browser?.close();
  await w?.close();
});

describe('AT-R1a.1 and UX-94 colours measured in the seeded world', () => {
  it('AT-R1a.1d UX-94 measured contrast in the seeded world: header name, hero text and button, a link and the active nav marker (375 px, #E9A020)', async () => {
    const { page } = await as(SALMA, PHONE);
    await visit(page, HOME);
    const name = await colours(page, '#space-name');
    assert.ok(contrast(name.fg, name.bg) >= 4.5, `#space-name ${name.fg} on ${name.bg}`);
    const header = await page.locator('#space-name').evaluate((el) => getComputedStyle(el.closest('header')!).backgroundColor);
    assert.equal(hex(header), '#e9a020', 'the header is in the school colour');
    const title = await colours(page, '#continue .hero-title');
    assert.ok(contrast(title.fg, title.bg) >= 4.5, `hero text ${title.fg} on ${title.bg}`);
    const btn = await colours(page, '#continue-link');
    assert.ok(contrast(btn.fg, btn.bg) >= 4.5, `hero button ${btn.fg} on ${btn.bg}`);
    const link = await colours(page, '#todo a[href$="/todo"]');
    assert.ok(contrast(link.fg, link.bg) >= 4.5, `link ${link.fg} on ${link.bg}`);
    const marker = await colours(page, '#top-nav a[aria-current="page"]');
    assert.ok(contrast(marker.border, marker.bg) >= 3, `nav marker ${marker.border} on ${marker.bg}`);
    await shot(page, 'UX-94-phone');
  });
});

describe('UX-95 fonts and assets from our own origin', () => {
  it('AT-R1a.4a UX-95 no third-party request: home, My subjects, to-do, results and account pages ask only the product\'s own host', async () => {
    const { page, hosts } = await as(SALMA, PHONE);
    for (const path of [HOME, SUBJECTS_PAGE, TODO_PAGE, `/s/${ID.space}/results`, '/account']) await visit(page, path);
    assert.deepEqual([...hosts], [new URL(w.url).host]);
  });

  it('AT-R1a.6c UX-95 no third-party request on the sign-in, publisher home, subject editor, admin home and owner home', async () => {
    const own = new URL(w.url).host;
    const signin = await as(null, PHONE);
    await visit(signin.page, '/signin');
    const pub = await as(MATH.teacher, PHONE);
    for (const path of [`/s/${ID.space}/publish`, `/s/${ID.space}/publish/edit/${MATH.id}`]) await visit(pub.page, path);
    const admin = await as(ADMIN, PHONE);
    await visit(admin.page, `/s/${ID.space}/admin`);
    const owner = await as(OWNER, PHONE);
    await visit(owner.page, '/owner');
    for (const hosts of [signin.hosts, pub.hosts, admin.hosts, owner.hosts]) assert.deepEqual([...hosts], [own]);
  });

  it('AT-R1a.4b UX-95 the fonts the page uses come from /assets/fonts with a long cache; the OFL file is served', async () => {
    const { page } = await as(SALMA, PHONE);
    const fonts: { url: string; status: number; cache: string }[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/assets/fonts/')) fonts.push({ url: r.url(), status: r.status(), cache: r.headers()['cache-control'] ?? '' });
    });
    await visit(page, HOME);
    await page.waitForTimeout(200);
    assert.ok(fonts.length > 0, 'the home loads its fonts');
    for (const f of fonts) {
      assert.equal(f.status, 200, f.url);
      assert.ok(Number(/max-age=(\d+)/.exec(f.cache)?.[1] ?? 0) >= 2_592_000, `${f.url}: ${f.cache}`);
      assert.equal(new URL(f.url).host, new URL(w.url).host);
    }
    const ofl = await page.request.get(w.url + '/assets/fonts/OFL.txt');
    assert.equal(ofl.status(), 200);
    assert.match(await ofl.text(), /SIL OPEN FONT LICENSE/i);
  });

  it('AT-R1a.4c the greeting is drawn in the chosen typeface', async () => {
    const { page } = await as(SALMA, PHONE);
    await visit(page, HOME);
    const family = await page.locator('#greeting').evaluate((el) => getComputedStyle(el).fontFamily);
    assert.match(family, new RegExp(`^"?${FONT}"?`), family);
    assert.ok(await page.evaluate((f) => document.fonts.check(`16px "${f}"`, 'سلمى'), FONT), 'the face is loaded');
  });
});

describe('UX-96 navigation bar and header nav', () => {
  const navAt = (page: Page) => page.evaluate(() => {
    const nav = document.querySelector('nav#top-nav') as HTMLElement;
    const items = [...nav.querySelectorAll('a')].map((a) => {
      const r = a.getBoundingClientRect();
      const s = getComputedStyle(a);
      return { id: a.id, current: a.getAttribute('aria-current'), h: r.height, w: r.width, weight: Number(s.fontWeight), mark: s.borderTopWidth + ' ' + s.borderBottomWidth, icon: Boolean(a.querySelector('svg')), word: a.textContent!.trim() };
    });
    const r = nav.getBoundingClientRect();
    const main = document.querySelector('main')!.getBoundingClientRect();
    return { position: getComputedStyle(nav).position, bottom: r.bottom, top: r.top, mainTop: main.top, vh: innerHeight, items };
  });

  it('AT-R1a.2f UX-96 nav#top-nav holds the five items, Home current; a bottom bar at 375 and 768, in the header at 1280', async () => {
    for (const vp of [PHONE, TABLET, DESKTOP]) {
      const { page } = await as(SALMA, vp);
      await visit(page, HOME);
      const nav = await navAt(page);
      assert.deepEqual(nav.items.map((i) => i.id), ['nav-home', 'nav-subjects', 'nav-todo', 'nav-results', 'nav-account'], `${vp.width}`);
      assert.deepEqual(nav.items.filter((i) => i.current === 'page').map((i) => i.id), ['nav-home']);
      for (const i of nav.items) assert.ok(i.icon && i.word, `${i.id}: icon and word`);
      if (vp.width < 960) {
        assert.equal(nav.position, 'fixed', `${vp.width}: a bar`);
        assert.ok(Math.abs(nav.bottom - nav.vh) <= 1, `${vp.width}: at the bottom`);
        for (const i of nav.items) assert.ok(i.h >= 56, `${i.id}: ${i.h} px tall`);
        const widths = nav.items.map((i) => Math.round(i.w));
        assert.ok(Math.max(...widths) - Math.min(...widths) <= 1, `equal widths ${widths}`);
      } else {
        assert.notEqual(nav.position, 'fixed', '1280: in the header');
        assert.ok(nav.top < nav.mainTop, '1280: above the content');
      }
      const cur = nav.items.find((i) => i.current)!;
      const other = nav.items.find((i) => !i.current)!;
      assert.ok(cur.weight > other.weight || cur.mark !== other.mark, 'the current item is marked by weight or a bar, not colour alone');
      if (vp === PHONE) await shot(page, 'UX-96-phone');
      if (vp === DESKTOP) await shot(page, 'UX-96-desktop');
    }
  });

  it('UX-96 learner+guardian, guardian-only and publisher navigation', async () => {
    const both = await as(LAILA, PHONE);
    await visit(both.page, HOME);
    const b = await navAt(both.page);
    assert.deepEqual(b.items.map((i) => i.id), ['nav-home', 'nav-guardian', 'nav-todo', 'nav-results', 'nav-account']);
    assert.equal(b.position, 'fixed');
    const guardian = await as(AHMED, PHONE);
    await visit(guardian.page, `/s/${ID.space}/linked`);
    const g = await navAt(guardian.page);
    assert.deepEqual(g.items.map((i) => i.id), ['nav-guardian', 'nav-account']);
    assert.equal(g.position, 'fixed');
    const pub = await as(MATH.teacher, PHONE);
    await visit(pub.page, `/s/${ID.space}/publish`);
    const p = await navAt(pub.page);
    assert.notEqual(p.position, 'fixed', 'staff pages keep the nav in the header');
    assert.ok(p.top < p.mainTop);
  });
});

describe('UX-97 continue hero states and first screen', () => {
  it('AT-R1a.2h UX-97 the hero link ends within 812 px at 375×812 and within 844 px at 390×844; the button is at least 44 px tall', async () => {
    for (const vp of [PHONE, { width: 390, height: 844 }]) {
      const { page } = await as(SALMA, vp);
      await visit(page, HOME);
      const link = await box(page, '#continue-link');
      assert.ok(link.bottom <= vp.height, `${vp.width}×${vp.height}: ends at ${link.bottom}`);
      assert.ok(link.h >= 44, `button ${link.h} px`);
      if (vp === PHONE) await shot(page, 'UX-97-phone');
    }
  });
});

describe('UX-98 due strip order, tags and see all', () => {
  it('UX-98 each strip row is one link at least 44 px tall; "see all" is at least 44 px', async () => {
    const { page } = await as(SALMA, PHONE);
    await visit(page, HOME);
    const rows = await page.locator('#todo .strip-row a').evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height));
    assert.ok(rows.length > 0 && rows.length <= 3);
    for (const h of rows) assert.ok(h >= 44, `row link ${h} px`);
    const all = await box(page, `#todo a[href$="/todo"]`);
    assert.ok(all.h >= 44, `see all ${all.h} px`);
    await shot(page, 'UX-98-phone');
  });
});

describe('UX-99 subject card parts, announcement line and grid', () => {
  it('AT-R1a.2g UX-99 cards per row 1 / 2 / 3 at 375 / 768 / 1280; no horizontal overflow at 320 / 375 / 768 / 1280', async () => {
    for (const [vp, n, name] of [[PHONE, 1, 'phone'], [TABLET, 2, 'tablet'], [DESKTOP, 3, 'desktop']] as const) {
      const { page } = await as(SALMA, vp);
      await visit(page, HOME);
      assert.equal(await perRow(page), n, `${vp.width}`);
      await shot(page, `UX-99-${name}`);
    }
    for (const width of WIDTHS) {
      const { page } = await as(SALMA, { width, height: 800 });
      for (const path of [HOME, SUBJECTS_PAGE, TODO_PAGE]) {
        await visit(page, path);
        assert.ok(await sideways(page) <= 0, `${path} at ${width}: ${await wide(page)}`);
      }
    }
  });

  it('UX-99 the band, the action at least 44 × 44 and the one-line announcement with an ellipsis', async () => {
    const { page } = await as(SALMA, PHONE);
    await visit(page, HOME);
    const parts = await page.locator('#my-list > li[data-subject]').evaluateAll((lis) => lis.map((li) => {
      const band = li.querySelector('.band')!.getBoundingClientRect();
      const go = li.querySelector('a.go-card')?.getBoundingClientRect();
      const ann = li.querySelector('.ann a') as HTMLElement | null;
      const s = ann ? getComputedStyle(ann) : null;
      return { id: li.getAttribute('data-subject'), band: Math.min(band.width, band.height), go: go ? Math.min(go.width, go.height) : null, ann: s ? { ws: s.whiteSpace, to: s.textOverflow, lines: Math.round(ann!.getBoundingClientRect().height / parseFloat(s.lineHeight || '20')) } : null };
    }));
    for (const p of parts) {
      assert.ok(p.band >= 4, `${p.id}: band ${p.band}`);
      if (p.go !== null) assert.ok(p.go >= 44, `${p.id}: action ${p.go}`);
      if (p.ann) {
        assert.equal(p.ann.ws, 'nowrap', `${p.id}: one line`);
        assert.equal(p.ann.to, 'ellipsis', `${p.id}: ellipsis`);
      }
    }
    assert.ok(parts.some((p) => p.ann), 'some card shows its announcement');
  });
});

describe('UX-100 status tags words icon contrast', () => {
  it('UX-100 each tag says its state in words with styles removed; its icon is aria-hidden; measured contrast on the to-do page', async () => {
    const { page } = await as(SALMA, PHONE);
    await visit(page, TODO_PAGE);
    const tags = await page.locator('#todo .tag').evaluateAll((els) => els.map((el) => ({ cls: el.className, words: el.textContent!.trim(), hidden: [...el.querySelectorAll('svg')].every((s) => s.getAttribute('aria-hidden') === 'true') })));
    assert.ok(tags.length >= 3);
    for (const t of tags) {
      assert.ok(t.words.length > 1, `${t.cls}: words`);
      assert.ok(t.hidden, `${t.cls}: icon aria-hidden`);
    }
    for (const cls of ['late', 'today', 'due']) {
      const c = await colours(page, `#todo .tag.${cls}`);
      assert.ok(contrast(c.fg, c.bg) >= 4.5, `${cls}: ${c.fg} on ${c.bg}`);
    }
    await shot(page, 'UX-100-phone');
  });
});

describe('UX-102 subjects and todo pages', () => {
  it('UX-102 the to-do page at 375 marks its bar item current', async () => {
    const { page } = await as(SALMA, PHONE);
    await visit(page, TODO_PAGE);
    assert.equal(await page.locator('#nav-todo').getAttribute('aria-current'), 'page');
    await visit(page, SUBJECTS_PAGE);
    assert.equal(await page.locator('#nav-subjects').getAttribute('aria-current'), 'page');
    await visit(page, TODO_PAGE);
    await shot(page, 'UX-102-phone');
  });
});

describe('UX-103 empty home', () => {
  it('UX-103 nothing assigned: greeting, icon disc, the heading, one sentence and the bar, at 375', async () => {
    const { page } = await as(OMAR, PHONE);
    await visit(page, HOME);
    for (const sel of ['#greeting', '#nothing-yet .disc', '#nothing-yet h2', '#nothing-yet p', 'nav#top-nav']) assert.ok(await page.locator(sel).first().isVisible(), sel);
    assert.equal(await page.locator('#continue-link').count(), 0);
    await shot(page, 'UX-103-phone');
  });
});

describe('UX-105 computer layout columns and DOM order', () => {
  it('UX-105 from 960 px: content up to 1120 px, main column (hero, cards 3 per row) beside the due column', async () => {
    const { page } = await as(SALMA, DESKTOP);
    await visit(page, HOME);
    const main = await box(page, 'main');
    assert.ok(main.w <= 1120 && main.w >= 900, `main ${main.w}`);
    const hero = await box(page, '#continue');
    const due = await box(page, '#todo');
    const cards = await box(page, '#my-list');
    assert.ok(due.right <= hero.left + 1 || due.left >= hero.right - 1, 'the due column beside the hero');
    assert.ok(Math.abs(due.top - hero.top) <= 2, 'side by side from the same top');
    assert.ok(cards.top >= hero.bottom - 1, 'cards under the hero');
    assert.equal(await perRow(page), 3);
    await shot(page, 'UX-105-desktop');
  });
});

describe('UX-106 reduced motion', () => {
  const durations = (page: Page) => page.evaluate(() => [...document.querySelectorAll('*')].flatMap((el) => {
    const s = getComputedStyle(el);
    return [...s.transitionDuration.split(','), ...s.animationDuration.split(',')].map((d) => parseFloat(d) * (d.trim().endsWith('ms') ? 1 : 1000));
  }));
  it('UX-106 transitions at most 200 ms; under prefers-reduced-motion every duration is 0', async () => {
    for (const path of [HOME, TODO_PAGE]) {
      const normal = await as(SALMA, PHONE);
      await visit(normal.page, path);
      assert.ok(Math.max(...await durations(normal.page)) <= 200, `${path}: at most 200 ms`);
      const reduced = await as(SALMA, PHONE, { reducedMotion: 'reduce' });
      await visit(reduced.page, path);
      assert.equal(Math.max(...await durations(reduced.page)), 0, `${path}: reduced`);
    }
  });
});

describe('UX-126 focus not obscured by the bar', () => {
  it('UX-126 Tab through home, to-do and account at 375×812 and 375×400: no focused element meets the bar; padding and scroll padding fit the bar', async () => {
    for (const vp of [PHONE, { width: 375, height: 400 }]) {
      const { page } = await as(SALMA, vp);
      for (const path of [HOME, TODO_PAGE, '/account']) {
        await visit(page, path);
        const pad = await page.evaluate(() => {
          const bar = document.querySelector('nav#top-nav.tabbar') as HTMLElement | null;
          if (!bar || getComputedStyle(bar).position !== 'fixed') return null;
          return { bar: bar.getBoundingClientRect().height, scroll: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom), body: parseFloat(getComputedStyle(document.body).paddingBottom) };
        });
        if (pad) {
          assert.ok(Math.abs(pad.scroll - pad.bar) <= 1, `${path}: scroll-padding-bottom ${pad.scroll} = bar ${pad.bar}`);
          assert.ok(pad.body >= pad.bar - 1, `${path}: bottom padding ${pad.body} ≥ bar ${pad.bar}`);
        }
        const seen = new Set<string>();
        for (let i = 0; i < 80; i++) {
          await page.keyboard.press('Tab');
          const hit = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return null;
            const bar = document.querySelector('nav#top-nav.tabbar') as HTMLElement | null;
            const key = `${el.tagName}#${el.id}.${el.getAttribute('href') ?? el.getAttribute('name') ?? ''}`;
            if (!bar || bar.contains(el) || getComputedStyle(bar).position !== 'fixed' || getComputedStyle(bar).display === 'none') return { key, overlap: false };
            const a = el.getBoundingClientRect();
            const b = bar.getBoundingClientRect();
            return { key, overlap: a.bottom > b.top + 0.5 && a.top < b.bottom && a.height > 0, a: [a.top, a.bottom], b: [b.top, b.bottom] };
          });
          if (!hit) continue;
          assert.ok(!hit.overlap, `${path} at ${vp.width}×${vp.height}: ${hit.key} under the bar ${JSON.stringify(hit)}`);
          if (seen.has(hit.key)) break;
          seen.add(hit.key);
        }
        assert.ok(seen.size > 0, `${path}: something takes focus`);
      }
    }
  });
});

describe('AT-R1a.6c staff pages keep their shape', () => {
  it('AT-R1a.6c publisher home, subject editor, admin home and owner home: no horizontal overflow at 320 / 375 / 768 / 1280', async () => {
    for (const width of WIDTHS) {
      const vp = { width, height: 800 };
      const pub = await as(MATH.teacher, vp);
      for (const path of [`/s/${ID.space}/publish`, `/s/${ID.space}/publish/edit/${MATH.id}`]) {
        await visit(pub.page, path);
        assert.ok(await sideways(pub.page) <= 0, `${path} at ${width}: ${await wide(pub.page)}`);
      }
      const admin = await as(ADMIN, vp);
      await visit(admin.page, `/s/${ID.space}/admin`);
      assert.ok(await sideways(admin.page) <= 0, `admin at ${width}: ${await wide(admin.page)}`);
      const owner = await as(OWNER, vp);
      await visit(owner.page, '/owner');
      assert.ok(await sideways(owner.page) <= 0, `owner at ${width}: ${await wide(owner.page)}`);
    }
  });
});
