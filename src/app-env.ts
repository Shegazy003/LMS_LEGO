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
  /** The person's own language choice (My account), or null for the default. */
  lang: Lang | null;
}

export interface CurrentSpace {
  id: string;
  name: string;
  kit: KitJson;
  /** The person's main role here (admin, then publisher, then learner). */
  role: string;
  /** Every role the person holds here today (memberships within their end date). */
  roles: string[];
  validUntil: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Db;
    user: CurrentUser | null;
    /** The person whose sign-in was stopped by "End access now" and arrives
     * with this request for the last time (release 1.1, AT-6); otherwise null. */
    endedSignIn: string | null;
    lang: Lang;
    space: CurrentSpace;
    /** The configured password strength (PASSWORD_ITERATIONS), read on every request. */
    iterations: number;
  };
}
