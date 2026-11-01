// Bindings from wrangler.jsonc.
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  /** The password strength in PBKDF2 iterations (wrangler.jsonc "vars"); see src/auth/password.ts. */
  PASSWORD_ITERATIONS?: string;
  /** Set only in the test environment; see src/test-hooks.ts. */
  TEST_HOOKS?: string;
}
