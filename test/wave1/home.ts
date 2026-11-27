// What a learner home shows, read in a real browser (LMS wave 1, L1, contract
// section 4): the cards in order, and per card its title link, teacher line,
// lesson count, Start link and every link it holds.
import type { Page } from 'playwright';
import type { Label } from '../../src/labels.ts';

export interface CardSeen {
  title: string;
  titleHref: string | null;
  headingLevel: string;
  teacher: string | null;
  count: string | null;
  start: { text: string; href: string } | null;
  none: string | null;
  links: string[];
  text: string;
}

export async function cardsOn(page: Page): Promise<CardSeen[]> {
  return page.locator('#my-list > li').evaluateAll((items) => items.map((li) => {
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const heading = li.querySelector('h1, h2, h3, h4');
    const titleLink = heading?.querySelector('a') ?? null;
    const start = li.querySelector('a.start');
    const text = (el: Element | null) => (el ? clean((el as HTMLElement).innerText) : null);
    return {
      title: clean((heading as HTMLElement | null)?.innerText),
      titleHref: titleLink?.getAttribute('href') ?? null,
      headingLevel: heading?.tagName ?? '',
      teacher: text(li.querySelector('.teacher')),
      count: text(li.querySelector('.count')),
      // LMS redesign R1a (UX-1 row, look only; UX-99): the action shows its word; its accessible name (aria-label)
      // is the old text «<word>: <title>», read here.
      start: start ? { text: clean(start.getAttribute('aria-label') ?? (start as HTMLElement).innerText), href: start.getAttribute('href') ?? '' } : null,
      none: text(li.querySelector('.none')),
      links: [...li.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''),
      text: clean((li as HTMLElement).innerText),
    };
  }));
}

/** The lesson count as section 4.2 writes it, through the label function: "<n> <lessons>", "1 <lesson>" in lower case. */
export function countText(t: Label, n: number, lang: 'ar' | 'en'): string {
  return n === 1 ? t('lessonCountOne', { lesson: t('lesson').toLocaleLowerCase(lang) }) : t('lessonCount', { n: String(n) });
}
