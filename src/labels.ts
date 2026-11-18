// The one label function. Every word a user sees is looked up here:
// - a canonical concept ('publisher', 'group', …) is read from the space's kit;
// - a product sentence ('signIn', 'accessEnded', …) is read from the product
//   dictionary, and any {concept} inside it is again read from the kit.
// Templates never write a concept word themselves; a test enforces that.
import { UI, type UiKey } from './i18n/ui.ts';
import { SEED_KIT_WORDS } from './kits/seed.ts';

export type Lang = 'ar' | 'en';
export const LANGS: readonly Lang[] = ['ar', 'en'];
export const CONCEPTS = ['space', 'admin', 'publisher', 'learner', 'group', 'subject', 'chapter', 'lesson', 'material'] as const;
export type Concept = (typeof CONCEPTS)[number];

/** Kit words added in release 2 (Guardian: Parent at the School kit,
 * Supervisor at the Company kit; from R2-b Exam: Exam at the School kit,
 * Assessment at the Company kit; from R2-d the words of the lesson-activity
 * feature: its name, the lessons, and the pair your-guardian / the-learner of
 * its notice, at the School kit your parent / child, at the Company kit your
 * supervisor / employee). Like a concept, each is
 * read from the space's kit; a kit made before release 2 has none, so its seed
 * kit's word is used (SEED_KIT_WORDS). The owner's names form edits the nine
 * concepts only.
 * LMS wave 2 (product-contract v2 on PIL-225, AT-1.6 and UX-32): lessonPlural,
 * the plural of the kit lesson word in a progress line ("Done: 3 of 5
 * <lessonPlural>"). The R2-d word "lessons" stays as it is. */
export const KIT_WORDS = ['guardian', 'exam', 'lessonActivity', 'lessons', 'yourGuardian', 'child', 'lessonPlural'] as const;
export type KitWord = (typeof KIT_WORDS)[number];

export interface KitJson {
  seed: string;
  name: Record<Lang, string>;
  languages: Lang[];
  labels: Record<Lang, Record<Concept, string> & Partial<Record<KitWord, string>>>;
  theme: {
    logoKey: string | null;
    logoType: string | null;
    primaryColor: string;
    accentColor: string | null;
    fontFamily: string | null;
  };
  gamification: { enabled: boolean; pack: string | null };
}

export type LabelKey = Concept | KitWord | UiKey;
export type Label = (key: LabelKey, vars?: Record<string, string>) => string;

const isConcept = (key: string): key is Concept | KitWord =>
  (CONCEPTS as readonly string[]).includes(key) || (KIT_WORDS as readonly string[]).includes(key);

export function makeLabel(lang: Lang, kit?: KitJson): Label {
  const concept = (key: Concept | KitWord): string => {
    if (!kit) throw new Error(`label "${key}" needs a space's kit`);
    const own = kit.labels[lang][key];
    if (own !== undefined) return own;
    const words = SEED_KIT_WORDS[kit.seed] ?? SEED_KIT_WORDS.school;
    return words[lang][key as KitWord];
  };
  return (key, vars = {}) => {
    if (isConcept(key)) return concept(key);
    const template: string | undefined = UI[lang][key as UiKey];
    if (template === undefined) throw new Error(`unknown label key "${key}"`);
    // One pass: inserted values are never expanded again.
    return template.replace(/\{(\w+)\}/g, (_, name: string) => {
      if (Object.hasOwn(vars, name)) return vars[name];
      if (isConcept(name)) return concept(name);
      throw new Error(`label "${key}" is missing a value for {${name}}`);
    });
  };
}

export function dirFor(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

/** The language cookie of the pages outside any space (LMS wave 1, L2,
 * section 8.3): the choice made with the language switch on this device. */
export const LANG_COOKIE = 'lms_lang';

/** A language value as the switch and the cookie carry it: only "ar" or "en", anything else is no choice. */
export const langChoice = (value: string | undefined | null): Lang | null => (value === 'ar' || value === 'en' ? value : null);

/** Language for pages outside any space (sign-in, recovery, setup, the owner's
 * pages, the space list): the choice made on this device with the language
 * switch (the lms_lang cookie), and Arabic when there is none. The browser's
 * own language is not read (L2, section 8.3). */
export function deviceLang(cookie: string | undefined): Lang {
  return langChoice(cookie) ?? 'ar';
}
