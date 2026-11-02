// Removing and restoring a chapter, a lesson or a material (release 1.1, AT-8).
// Scaffolding for the AT-8 tests: not built yet.
import type { Db } from './db.ts';

type Change = (db: Db, spaceId: string, userId: string, id: string, at: number) => Promise<boolean>;
const notYet: Change = async () => false;

export const removeMaterial: Change = notYet;
export const removeLesson: Change = notYet;
export const removeChapter: Change = notYet;
export const restoreMaterial: Change = notYet;
export const restoreLesson: Change = notYet;
export const restoreChapter: Change = notYet;
