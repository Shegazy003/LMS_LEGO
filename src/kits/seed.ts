// The three seed kits, from docs/02-LEGO-MODEL.md. They are product constants:
// creating a space copies the chosen kit into that space's own kit row, which
// can later be edited without touching any other space. The Arabic labels are
// first drafts for the owner to correct.
import type { KitJson, KitWord } from '../labels.ts';

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

/** Release 2 kit words of each seed kit (src/labels.ts KIT_WORDS). They are
 * read from here for every space of that seed, including spaces made before
 * release 2, whose kit rows do not carry them. */
// From R2-d, the lesson-activity words (contract product-contract-r2, section 3
// and AT-15f). "yourGuardian" starts the learner's notice, so it is written
// with a capital in English.
const ACTIVITY = { en: { lessonActivity: 'Lesson activity', lessons: 'lessons' }, ar: { lessonActivity: 'نشاط الدروس', lessons: 'الدروس' } };

export const SEED_KIT_WORDS: Record<string, Record<'ar' | 'en', Record<KitWord, string>>> = {
  school: {
    en: { guardian: 'Parent', exam: 'Exam', ...ACTIVITY.en, yourGuardian: 'Your parent', child: 'child' },
    ar: { guardian: 'ولي أمر', exam: 'امتحان', ...ACTIVITY.ar, yourGuardian: 'ولي أمرك', child: 'الطفل' },
  },
  company: {
    en: { guardian: 'Supervisor', exam: 'Assessment', ...ACTIVITY.en, yourGuardian: 'Your supervisor', child: 'employee' },
    ar: { guardian: 'مشرف', exam: 'تقييم', ...ACTIVITY.ar, yourGuardian: 'مشرفك', child: 'الموظّف' },
  },
  university: {
    en: { guardian: 'Guardian', exam: 'Exam', ...ACTIVITY.en, yourGuardian: 'Your guardian', child: 'student' },
    ar: { guardian: 'ولي أمر', exam: 'امتحان', ...ACTIVITY.ar, yourGuardian: 'ولي أمرك', child: 'الطالب' },
  },
};

export function seedKit(id: string): KitJson {
  const kit = SEED_KITS.find((k) => k.seed === id);
  if (!kit) throw new Error(`no seed kit "${id}"`);
  return structuredClone(kit);
}
