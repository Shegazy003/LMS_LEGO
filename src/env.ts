// Bindings from wrangler.jsonc.
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  /** Set only in the test environment; see src/test-hooks.ts. */
  TEST_HOOKS?: string;
}
