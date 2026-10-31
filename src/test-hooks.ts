// Test-only routes. Registered only when the build-time constant __TEST_HOOKS__
// is true (wrangler.jsonc env "test"), and even then only when the runtime flag
// TEST_HOOKS is "1". The production bundle does not contain this module; see
// test/guards/production-guard.test.ts.
import type { Hono } from 'hono';
import { now, setClockOffset } from './clock.ts';
import type { AppEnv } from './app-env.ts';

export function registerTestHooks(app: Hono<AppEnv>): void {
  app.post('/__test/clock', async (c) => {
    if (c.env.TEST_HOOKS !== '1') return c.notFound();
    const body = await c.req.json<{ offsetMs?: unknown }>();
    const offset = Number(body.offsetMs);
    if (!Number.isFinite(offset)) return c.json({ error: 'offsetMs must be a number' }, 400);
    setClockOffset(offset);
    return c.json({ now: new Date(now()).toISOString() });
  });
}
