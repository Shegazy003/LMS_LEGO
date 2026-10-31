// The product's clock. In production it is the real time. Test builds can move
// it (src/test-hooks.ts); that code does not exist in the production bundle.
let offsetMs = 0;

export function now(): number {
  return Date.now() + offsetMs;
}

export function setClockOffset(ms: number): void {
  offsetMs = ms;
}
