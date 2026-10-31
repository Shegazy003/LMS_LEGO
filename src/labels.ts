// The one label function. Not implemented yet.
export type Lang = 'ar' | 'en';
export const CONCEPTS = ['space', 'admin', 'publisher', 'learner', 'group', 'subject', 'chapter', 'lesson', 'material'] as const;
export type Concept = (typeof CONCEPTS)[number];
export interface KitJson {
  seed: string;
  name: Record<Lang, string>;
  languages: Lang[];
  labels: Record<Lang, Record<Concept, string>>;
  theme: {
    logoKey: string | null;
    logoType: string | null;
    primaryColor: string;
    accentColor: string | null;
    fontFamily: string | null;
  };
  gamification: { enabled: boolean; pack: string | null };
}
export type Label = (key: string, vars?: Record<string, string>) => string;
export function makeLabel(_lang: Lang, _kit?: KitJson): Label {
  throw new Error('not implemented');
}
export function dirFor(_lang: Lang): 'rtl' | 'ltr' {
  throw new Error('not implemented');
}
