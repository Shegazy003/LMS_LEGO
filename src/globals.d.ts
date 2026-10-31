// Build-time constant from wrangler.jsonc "define": false in production, true
// only in the test environment. Code behind `if (__TEST_HOOKS__)` is removed
// from the production bundle.
declare const __TEST_HOOKS__: boolean;
