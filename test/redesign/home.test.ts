// LMS redesign wave R1a (product-contract v2 on PIL-322, section 6): the
// learner home, My subjects and to-do pages as served (no browser): AT-R1a.2
// (a) to (e) and (i), AT-R1a.3 (a) to (c), and the markup halves of UX-98,
// UX-99, UX-100, UX-102, UX-103. Layout (cards per row, bar, first screen) is
// in ux.test.ts with a browser.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AHMED, ANNOUNCEMENTS, AT, DRAFT_MARK, HERO_LESSON, HIDDEN_MARK, HOME, ID, KARIM, MATH, MONA, OMAR, RANA, SALMA, SUBJECTS, SUBJECTS_PAGE,
  TODAY, TODO_PAGE, VISITOR, lessonPage, r1aWorld, subjectPage, textOf, type R1aWorld,
} from './world.ts';
import { Client } from '../support/http.ts';
import { learnerTodo, type Learner } from '../../src/progress.ts';
import { TODO_MAX_PER_GROUP, todoGroups, todoWindow } from '../../src/due.ts';
import { Db } from '../../src/db.ts';
import { d1Over } from '../support/in-process.ts';
import { cutText } from '../../src/announcements.ts';
import { autoColour, subjectColours } from '../../src/look.ts';
import { makeLabel } from '../../src/labels.ts';
import { seedKit } from '../../src/kits/seed.ts';
import { learnerHome } from '../../src/views/learn.ts';
import type { ContinueArea, LearnerCard } from '../../src/learning.ts';

const t = makeLabel('ar', seedKit('school'));
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** The element with this id, start tag to its matching end tag (same tag name, nesting counted). */
export function elementById(page: string, id: string): string | null {
  const open = new RegExp(`<([a-z0-9]+)\\b[^>]*\\sid="${id}"[^>]*>`).exec(page);
  if (!open) return null;
  const tag = open[1];
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g');
  re.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let m = re.exec(page); m; m = re.exec(page)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return page.slice(open.index, m.index + m[0].length);
  }
  return null;
}
const links = (fragment: string) => [...fragment.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
  href: decode(/\shref="([^"]*)"/.exec(m[1])?.[1] ?? ''), attrs: m[1], text: textOf(m[2]), label: decode(/\saria-label="([^"]*)"/.exec(m[1])?.[1] ?? ''),
}));
/** The cards of a page: one per li[data-subject] of #my-list. */
export function cardsOf(page: string): { id: string; html: string }[] {
  const list = elementById(page, 'my-list') ?? '';
  const out: { id: string; html: string }[] = [];
  const re = /<li\b[^>]*\sdata-subject="([^"]+)"[^>]*>/g;
  for (let m = re.exec(list); m; m = re.exec(list)) {
    let depth = 1;
    const inner = /<li\b[^>]*>|<\/li>/g;
    inner.lastIndex = m.index + m[0].length;
    for (let n = inner.exec(list); n; n = inner.exec(list)) {
      depth += n[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        out.push({ id: m[1], html: list.slice(m.index, n.index + n[0].length) });
        re.lastIndex = n.index + n[0].length;
        break;
      }
    }
  }
  return out;
}
const annLineOf = (card: string) => /<p class="ann"[\s\S]*?<\/p>/.exec(card)?.[0] ?? null;

let w: R1aWorld;
let salma: Client;
let home = '';
before(async () => {
  w = await r1aWorld();
  salma = await w.as(SALMA);
  const res = await salma.get(HOME);
  assert.equal(res.status, 200);
  home = await res.text();
});
after(async () => {
  await w?.close();
});

const published = SUBJECTS.filter((s) => s.published);

describe('AT-R1a.2 the learner home (as سلمى)', () => {
  it('AT-R1a.2a DOM order: activity notice → #continue → #todo → #my-list; no #announcements on the home', () => {
    const at = (needle: string) => home.indexOf(needle);
    const notice = Math.max(at('id="notice-card"'), at('id="notice-line"'));
    assert.ok(notice > 0, 'the activity notice is drawn (activity is on)');
    assert.ok(notice < at('id="continue"'), 'notice before #continue');
    assert.ok(at('id="continue"') < at('id="todo"'), '#continue before #todo');
    assert.ok(at('id="todo"') < at('id="my-list"'), '#todo before #my-list');
    assert.equal(at('id="announcements"'), -1, 'no #announcements element on the home');
  });

  it('AT-R1a.2b UX-97 #continue: exactly one link, to wave 2\'s lesson, with the subject · chapter line, the lesson title and the progress text', () => {
    const hero = elementById(home, 'continue')!;
    const a = links(hero);
    assert.equal(a.length, 1);
    assert.equal(a[0].href, lessonPage(HERO_LESSON));
    const text = textOf(hero);
    assert.ok(text.includes(`${MATH.title} · ${MATH.chapters[1].title}`), text);
    assert.ok(text.includes(HERO_LESSON.title));
    assert.ok(text.includes(t('doneCount', { n: '3' }).replace(/\s+/g, ' ')) || /3\D+8/.test(text), `progress text: ${text}`);
    assert.match(hero, /style="[^"]*--subj:#[0-9a-f]{6}/i, 'on the subject colour');
  });

  it('AT-R1a.2b UX-97 the four states each render their key (fixture)', () => {
    const space = { id: 'fx', name: 'fx', primaryColor: '#e9a020', hasLogo: false, learner: true };
    const card: LearnerCard = {
      id: 'fx-subj', title: 'مادة', publisherName: null, count: 2, first: { id: 'fx-l1', title: 'درس أول' }, inOrder: false, opening: new Map(), next: null,
      steps: [{ id: 'fx-l1', title: 'درس أول', chapterId: 'fx-c1', chapterTitle: 'فصل' }, { id: 'fx-l2', title: 'درس ثان', chapterId: 'fx-c1', chapterTitle: 'فصل' }],
    };
    const render = (area: ContinueArea) => String(learnerHome(t, 'ar', space, 'سلمى', [card], null, { area, progress: new Map() }, new Map(), TODAY));
    const first = elementById(render({ kind: 'first' }), 'continue')!;
    assert.ok(textOf(first).includes(textOf(t('continueFirst', { lesson: t('lesson') }))), 'first');
    assert.equal(links(first).length, 0);
    const target = elementById(render({ kind: 'target', card, done: 1, target: card.steps[1] }), 'continue')!;
    assert.equal(links(target).length, 1);
    assert.ok(links(target)[0].text.includes(card.steps[1].title));
    const waiting = elementById(render({ kind: 'waiting', card, done: 1, next: { title: 'فصل لاحق', date: '2026-12-10' } }), 'continue')!;
    assert.equal(links(waiting).length, 0, 'waiting: no link (UX-90)');
    assert.ok(textOf(waiting).includes('فصل لاحق'), 'openNext as plain text');
    assert.match(waiting, /class="ico[^"]*"[^>]*data-icon="cal"|data-icon="cal"/, 'beside a calendar icon');
    const done = elementById(render({ kind: 'all-done' }), 'continue')!;
    assert.ok(textOf(done).includes(t('everythingDone')), 'all done');
    assert.equal(links(done).length, 0);
  });

  it('AT-R1a.2c UX-98 #todo: at most 3 items, overdue before today before next, each with its S6 tag and one link; a link to the to-do page', () => {
    const strip = elementById(home, 'todo')!;
    const rows = [...strip.matchAll(/<li\b[^>]*class="strip-row"[^>]*data-group="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
    assert.ok(rows.length > 0 && rows.length <= 3, `rows: ${rows.length}`);
    const order = rows.map((r) => r[1]);
    assert.deepEqual(order, [...order].sort((a, b) => ['overdue', 'today', 'next'].indexOf(a) - ['overdue', 'today', 'next'].indexOf(b)));
    const tagFor = { overdue: 'late', today: 'today', next: 'due' } as const;
    for (const [, group, inner] of rows) {
      assert.equal(links(inner).length, 1, 'one link per row');
      assert.match(inner, new RegExp(`class="tag ${tagFor[group as keyof typeof tagFor]}"`), `${group} row has its tag`);
    }
    assert.deepEqual(order, ['overdue', 'overdue', 'today'], 'the seeded world: two late, then today');
    const all = links(strip).find((l) => l.href === TODO_PAGE);
    assert.ok(all, 'see all leads to the to-do page');
    assert.equal(all.text, t('seeAll'));
  });

  it('AT-R1a.2c with no due items: the heading and «لا شيء مطلوب الآن»', async () => {
    const omar = await w.as(OMAR);
    // Omar has nothing assigned; يوسف has the class subjects: clear their due dates in a copy? Use a learner with subjects but nothing due.
    w.run('INSERT INTO subject_access (id, space_id, subject_id, group_id, user_id) VALUES (?, ?, ?, NULL, ?)', 'r1a-acc-omar', ID.space, SUBJECTS[3].id, OMAR.id);
    try {
      const page = await (await omar.get(HOME)).text();
      const strip = elementById(page, 'todo')!;
      assert.ok(strip, 'the strip is there');
      assert.ok(textOf(strip).includes(t('dueSoonHeading')));
      assert.ok(textOf(strip).includes('لا شيء مطلوب الآن'));
    } finally {
      w.run('DELETE FROM subject_access WHERE id = ?', 'r1a-acc-omar');
    }
  });

  it('AT-R1a.2d UX-99 #my-list: one li[data-subject] per assigned published subject, two links, progress text, automatic colour band and book icon', () => {
    const cards = cardsOf(home);
    assert.deepEqual(cards.map((c) => c.id).sort(), published.map((s) => s.id).sort());
    for (const c of cards) {
      const s = SUBJECTS.find((x) => x.id === c.id)!;
      const own = links(c.html.replace(annLineOf(c.html) ?? '', ''));
      assert.equal(own.length, 2, `${s.title}: title and action`);
      assert.equal(own[0].href, subjectPage(s));
      assert.ok(own[1].href.startsWith(`/s/${ID.space}/read/`), 'the action leads to a lesson');
      assert.ok(own[1].label.startsWith(own[1].text), 'the accessible name starts with the visible word');
      assert.match(c.html, /<h2\b/);
      assert.match(c.html, /class="count[^"]*"[^>]*>[^<]*\S/, 'visible progress text');
      const colour = subjectColours(autoColour(s.id).hex);
      assert.ok(c.html.includes(`--subj:${colour.subject}`), `${s.title}: its automatic colour`);
      assert.match(c.html, /class="band"/);
      assert.match(c.html, /data-icon="book"/);
    }
  });

  it('AT-R1a.2e UX-99 each card\'s announcement line equals the first item of its subject page (cut at 100 code points); hidden and unpublished never show', async () => {
    assert.ok(!home.includes(HIDDEN_MARK), 'the hidden announcement is on no card');
    assert.ok(!home.includes(DRAFT_MARK), 'the unpublished subject\'s announcement is on no card');
    for (const c of cardsOf(home)) {
      const s = SUBJECTS.find((x) => x.id === c.id)!;
      const page = await (await salma.get(subjectPage(s))).text();
      const block = elementById(page, 'announcements');
      const first = block ? /<li class="ann-item"[\s\S]*?<p class="ann-text"[^>]*>([\s\S]*?)<\/p>/.exec(block) : null;
      const line = annLineOf(c.html);
      if (!first) {
        assert.equal(line, null, `${s.title}: no line`);
        continue;
      }
      assert.ok(line, `${s.title}: a line`);
      const full = textOf(first[1]);
      const cut = cutText(full);
      const a = links(line);
      assert.equal(a.length, 1);
      assert.equal(a[0].href, `${subjectPage(s)}#announcements`);
      assert.equal(a[0].text.replace(/…$/, ''), cut.text, `${s.title}: the same text, cut at 100`);
      assert.equal(a[0].text.endsWith('…'), cut.cut);
    }
    const shown = ANNOUNCEMENTS.filter((n) => !('removed' in n) && n.subject.published);
    assert.ok(cardsOf(home).filter((c) => annLineOf(c.html)).length >= 3, `${shown.length} seeded`);
  });

  it('AT-R1a.2i UX-103 nothing assigned: greeting, the nothingAssigned heading and the bar; no #continue link', async () => {
    const page = await (await (await w.as(OMAR)).get(HOME)).text();
    assert.ok(elementById(page, 'greeting'));
    const empty = elementById(page, 'nothing-yet')!;
    assert.match(empty, /<h2[^>]*>[\s\S]*?<\/h2>/);
    assert.equal(textOf(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(empty)![1]), t('nothingAssigned'));
    assert.match(empty, /class="disc"/);
    assert.ok(elementById(page, 'top-nav'), 'the bar');
    const hero = elementById(page, 'continue');
    assert.equal(hero ? links(hero).length : 0, 0);
  });
});

describe('AT-R1a.3 My subjects and to-do pages', () => {
  it('AT-R1a.3a UX-102 /subjects shows the same cards in the same order as the home; nav-subjects is current', async () => {
    const res = await salma.get(SUBJECTS_PAGE);
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.deepEqual(cardsOf(page).map((c) => c.html), cardsOf(home).map((c) => c.html));
    assert.match(page, /<h1[^>]*>[^<]*موادّي/);
    assert.match(elementById(page, 'top-nav')!, /id="nav-subjects"[^>]*aria-current="page"/);
  });

  it('AT-R1a.3b UX-102 /todo lists exactly learnerTodo\'s items and counts for سلمى on 2026-11-27, with tags; nav-todo is current', async () => {
    const res = await salma.get(TODO_PAGE);
    assert.equal(res.status, 200);
    const page = await res.text();
    // What learnerTodo returns for سلمى on 2026-11-27 (the product's own read, over the same database).
    const db = new Db(d1Over(w.p.worker.sqlite, {}), () => undefined);
    const window = todoWindow(AT);
    const groups = todoGroups(await learnerTodo(db, { spaceId: ID.space, userId: SALMA.id } as Learner, window.today, window.last, TODO_MAX_PER_GROUP));
    const block = elementById(page, 'todo')!;
    const drawn = [...block.matchAll(/<div class="todo-group" data-group="([^"]+)">\s*<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<div class="todo-group"|<\/section>)/g)]
      .map((m) => ({ key: m[1], heading: textOf(m[2]), items: [...m[3].matchAll(/<li class="todo-item"[^>]*data-item="([^"]+)"([\s\S]*?)<\/li>/g)].map((i) => ({ id: i[1], html: i[2] })) }));
    assert.deepEqual(drawn.map((g) => g.key), groups.map((g) => g.key));
    const tagFor = { overdue: 'late', today: 'today', next: 'due' } as const;
    groups.forEach((g, i) => {
      assert.ok(drawn[i].heading.includes(`(${g.count})`), `${g.key}: count ${g.count} in «${drawn[i].heading}»`);
      assert.deepEqual(drawn[i].items.map((x) => x.id), g.items.map((x) => x.id), `${g.key}: the same items in the same order`);
      for (const item of drawn[i].items) assert.match(item.html, new RegExp(`class="tag ${tagFor[g.key]}"`), `${g.key} ${item.id}: its tag`);
    });
    assert.deepEqual(groups.map((g) => g.count), [2, 1, 3], 'the seeded world');
    assert.match(elementById(page, 'top-nav')!, /id="nav-todo"[^>]*aria-current="page"/);
    // With no due items: «لا شيء مطلوب الآن».
    const yous = await (await (await w.as(OMAR)).get(TODO_PAGE)).text();
    assert.ok(textOf(elementById(yous, 'todo') ?? '').includes('لا شيء مطلوب الآن'));
  });

  it('AT-R1a.3c access: each refused person gets exactly what /s/<space> gives them; a learner gets 200', async () => {
    const cases: [string, Client][] = [
      ['signed out', new Client(w.url)],
      ['non-member', await w.as(VISITOR)],
      ['member of another space only', await w.as(RANA)],
      ['guardian-only member', await w.as(AHMED)],
      ['staff member without a learner role', await w.as(MONA)],
      ['suspended membership', await w.as(KARIM).catch(() => new Client(w.url))],
    ];
    for (const [who, c] of cases) {
      const h = await c.get(HOME);
      const hb = await h.text();
      for (const path of [SUBJECTS_PAGE, TODO_PAGE]) {
        const r = await c.get(path);
        const rb = await r.text();
        assert.equal(r.status, h.status, `${who} ${path}: status`);
        assert.equal(r.headers.get('location'), h.headers.get('location'), `${who} ${path}: location`);
        assert.equal(rb, hb, `${who} ${path}: body`);
      }
    }
    for (const path of [SUBJECTS_PAGE, TODO_PAGE]) assert.equal((await salma.get(path)).status, 200);
  });
});
