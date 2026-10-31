// The three seed kits, from docs/02-LEGO-MODEL.md. They are product constants:
// creating a space copies the chosen kit into that space's own kit row, which
// can later be edited without touching any other space. The Arabic labels are
// first drafts for the owner to correct.
import type { KitJson } from '../labels.ts';

const base = { languages: ['ar', 'en'] as KitJson['languages'], gamification: { enabled: false, pack: null } };
const theme = { logoKey: null, logoType: null, primaryColor: '#1f6feb', accentColor: null, fontFamily: null };

export const SEED_KITS: readonly KitJson[] = [
  {
    ...base,
    theme,
    seed: 'school',
    name: { en: 'School', ar: 'مدرسة' },
    labels: {
      en: {
        space: 'School', admin: 'Administrator', publisher: 'Teacher', learner: 'Student', group: 'Class',
        subject: 'Subject', chapter: 'Chapter', lesson: 'Lesson', material: 'Material',
      },
      ar: {
        space: 'مدرسة', admin: 'مدير', publisher: 'معلّم', learner: 'طالب', group: 'فصل',
        subject: 'مادّة', chapter: 'وحدة', lesson: 'درس', material: 'مادة تعليمية',
      },
    },
  },
  {
    ...base,
    theme,
    seed: 'company',
    name: { en: 'Company', ar: 'شركة' },
    labels: {
      en: {
        space: 'Company', admin: 'HR administrator', publisher: 'Trainer', learner: 'Employee', group: 'Team',
        subject: 'Course', chapter: 'Module', lesson: 'Session', material: 'Material',
      },
      ar: {
        space: 'شركة', admin: 'مسؤول التدريب', publisher: 'مدرّب', learner: 'موظّف', group: 'فريق',
        subject: 'دورة', chapter: 'وحدة', lesson: 'جلسة', material: 'مادة تعليمية',
      },
    },
  },
  {
    ...base,
    theme,
    seed: 'university',
    name: { en: 'University', ar: 'جامعة' },
    labels: {
      en: {
        space: 'University', admin: 'Registrar', publisher: 'Lecturer', learner: 'Student', group: 'Section',
        subject: 'Module', chapter: 'Unit', lesson: 'Lecture', material: 'Material',
      },
      ar: {
        space: 'جامعة', admin: 'مسجّل', publisher: 'محاضر', learner: 'طالب', group: 'شعبة',
        subject: 'مقرّر', chapter: 'وحدة', lesson: 'محاضرة', material: 'مادة تعليمية',
      },
    },
  },
];

export function seedKit(id: string): KitJson {
  const kit = SEED_KITS.find((k) => k.seed === id);
  if (!kit) throw new Error(`no seed kit "${id}"`);
  return structuredClone(kit);
}
