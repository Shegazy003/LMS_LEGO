// Editing a space's own kit row (task 5, AT-5).
// Scaffolding only: the behaviour is implemented with the green commit.
import type { Concept, KitJson, Lang } from '../labels.ts';

export const LABEL_MAX = 40;

export type LabelsRead =
  | { ok: true; labels: Record<Lang, Record<Concept, string>> }
  | { ok: false; error: 'labelInvalid' | 'labelsIncomplete' };

export function labelField(lang: Lang, concept: Concept): string {
  return `${lang}.${concept}`;
}

export function readLabels(_body: Record<string, unknown>, _languages: readonly Lang[]): LabelsRead {
  throw new Error('not implemented');
}

export function switchedKit(_current: KitJson, _seed: string): KitJson | null {
  throw new Error('not implemented');
}
