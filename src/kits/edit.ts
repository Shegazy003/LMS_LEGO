// Editing a space's own kit row (task 5, AT-5). Only the owner edits a kit,
// on the owner's space page. Every change writes this space's kit row and
// nothing else: never the seed kits (product constants in seed.ts), never
// another space's row.
//
// - Labels: one form field per language and concept, named "<lang>.<concept>"
//   (for example "en.publisher"). Every language of the space must carry
//   exactly the nine concept keys; each label is 1 to 40 characters on one
//   line. Labels are stored as typed and escaped wherever they are shown.
// - Switching the kit: the space takes the chosen seed kit's name, labels and
//   reserved settings, so custom labels are replaced; the space keeps its own
//   languages and theme (logo and colour), which are edited separately.
import { oneLine } from '../names.ts';
import { CONCEPTS, LANGS, type Concept, type KitJson, type Lang } from '../labels.ts';
import { SEED_KITS } from './seed.ts';

export const LABEL_MAX = 40;

export type LabelsRead =
  | { ok: true; labels: Record<Lang, Record<Concept, string>> }
  | { ok: false; error: 'labelInvalid' | 'labelsIncomplete' };

export function labelField(lang: Lang, concept: Concept): string {
  return `${lang}.${concept}`;
}

const LABEL_FIELD = /^([a-z]{2,3})\.([a-z]+)$/;

/** Reads the label form: exactly the concept keys for each of the space's languages. */
export function readLabels(body: Record<string, unknown>, languages: readonly Lang[]): LabelsRead {
  const wanted = new Set(languages.flatMap((l) => CONCEPTS.map((c) => labelField(l, c))));
  const given = Object.keys(body).filter((k) => LABEL_FIELD.test(k));
  if (given.length !== wanted.size || !given.every((k) => wanted.has(k))) return { ok: false, error: 'labelsIncomplete' };
  const labels = {} as Record<Lang, Record<Concept, string>>;
  let invalid = false;
  for (const lang of languages) {
    labels[lang] = {} as Record<Concept, string>;
    for (const concept of CONCEPTS) {
      const raw = body[labelField(lang, concept)];
      if (typeof raw !== 'string') return { ok: false, error: 'labelsIncomplete' };
      const value = oneLine(raw, LABEL_MAX);
      if (value === null) invalid = true;
      else labels[lang][concept] = value;
    }
  }
  return invalid ? { ok: false, error: 'labelInvalid' } : { ok: true, labels };
}

export const isSeed = (id: string) => SEED_KITS.some((k) => k.seed === id);

/** The space's kit after switching to a seed kit, or null for anything that is not one of the three. */
export function switchedKit(current: KitJson, seed: string): KitJson | null {
  const kit = SEED_KITS.find((k) => k.seed === seed);
  if (!kit) return null;
  const copy = structuredClone(kit);
  return {
    ...copy,
    languages: [...current.languages].filter((l): l is Lang => LANGS.includes(l)),
    theme: structuredClone(current.theme),
  };
}
