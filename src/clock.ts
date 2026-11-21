// The product's clock. In production it is the real time. Test builds can move
// it (src/test-hooks.ts); that code does not exist in the production bundle.
let offsetMs = 0;
// LMS wave 6 (product-contract v2 on PIL-257, W6-c): a test may pin the clock
// to one exact instant instead of moving it; null is the real (offset) time.
let fixedMs: number | null = null;

export function now(): number {
  return fixedMs ?? Date.now() + offsetMs;
}

export function setClockOffset(ms: number): void {
  offsetMs = ms;
}

/** Test-only (W6-c): pins now() to this instant, or gives it back to the moving clock (null). */
export function setClockFixed(ms: number | null): void {
  fixedMs = ms;
}
