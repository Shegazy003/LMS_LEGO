// Types shared by the router and its parts.
import type { Db } from './db.ts';
import type { Env } from './env.ts';
import type { KitJson, Lang } from './labels.ts';

export interface CurrentUser {
  id: string;
  username: string;
  display_name: string;
  is_owner: number;
  sessionId: string;
}

export interface CurrentSpace {
  id: string;
  name: string;
  kit: KitJson;
  role: string;
  validUntil: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Db;
    user: CurrentUser | null;
    lang: Lang;
    space: CurrentSpace;
  };
}
