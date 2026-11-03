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
 * Assessment at the Company kit). Like a concept, each is read from the
 * space's kit; a kit made before release 2 has none, so its seed kit's word is
 * used (SEED_KIT_WORDS). The owner's names form edits the nine concepts only. */
export const KIT_WORDS = ['guardian', 'exam'] as const;
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

/** Language for pages outside any space (sign-in, setup, owner): Arabic when
 * the browser prefers it over English, otherwise English. */
export function productLang(acceptLanguage: string | undefined): Lang {
  const prefs = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { lang: tag.split('-')[0], q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((p) => p.lang === 'ar' || p.lang === 'en')
    .sort((a, b) => b.q - a.q);
  return (prefs[0]?.lang as Lang | undefined) ?? 'en';
}
