// What a lesson page's end and a subject outline show, read in a real browser
// (LMS wave 1, L1, contract sections 5 and 6).
import type { Page } from 'playwright';

export interface LessonEnd {
  title: string;
  place: string;
  navName: string | null;
  next: { line1: string; line2: string | null; href: string } | null;
  previous: { text: string; href: string } | null;
  outline: { text: string; href: string } | null;
  end: string | null;
  home: { text: string; href: string } | null;
  /** Every link in the block, in reading order. */
  links: string[];
  /** Whether the block comes after the last material. */
  afterMaterials: boolean;
}

export async function lessonEnd(page: Page): Promise<LessonEnd> {
  return page.evaluate(() => {
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const text = (sel: string, root: ParentNode = document) => {
      const el = root.querySelector(sel) as HTMLElement | null;
      return el ? clean(el.innerText) : null;
    };
    const nav = document.querySelector('nav#lesson-nav') as HTMLElement | null;
    const link = (sel: string) => {
      const a = nav?.querySelector(sel) as HTMLAnchorElement | null;
      // The link's words (its decorative arrow, aria-hidden, aside).
      const words = a ? [...a.childNodes].filter((n) => !(n instanceof HTMLElement && n.getAttribute('aria-hidden') === 'true')).map((n) => (n instanceof HTMLElement ? n.innerText : n.textContent)).join(' ') : '';
      return a ? { text: clean(words), href: a.getAttribute('href') ?? '' } : null;
    };
    const next = nav?.querySelector('a#next-lesson') as HTMLElement | null;
    const items = document.querySelector('#items');
    return {
      title: text('h1#lesson-title') ?? '',
      place: text('#lesson-place') ?? '',
      navName: nav?.getAttribute('aria-label') ?? null,
      next: next ? { line1: text('.line1', next) ?? '', line2: text('.line2', next), href: next.getAttribute('href') ?? '' } : null,
      previous: link('a#previous-lesson'),
      outline: link('a#back-to-outline'),
      end: nav ? text('#last-lesson', nav) : null,
      home: link('a#end-home'),
      links: nav ? [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '') : [],
      afterMaterials: Boolean(nav && items && (items.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING) && !items.contains(nav)),
    };
  });
}

export interface ChapterSeen {
  id: string;
  title: string;
  count: string;
  open: boolean;
  lessons: string[];
  text: string;
}

export async function chaptersOn(page: Page): Promise<ChapterSeen[]> {
  return page.locator('#outline [data-chapter]').evaluateAll((els) => els.map((el) => {
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const summary = el.querySelector('summary');
    return {
      id: el.getAttribute('data-chapter') ?? '',
      title: clean((summary?.querySelector('.title') as HTMLElement | null)?.textContent),
      count: clean((summary?.querySelector('.count') as HTMLElement | null)?.textContent),
      open: el.tagName === 'DETAILS' && (el as HTMLDetailsElement).open,
      lessons: [...el.querySelectorAll('a[data-lesson]')].map((a) => clean(a.textContent)),
      text: clean(el.textContent),
    };
  }));
}
