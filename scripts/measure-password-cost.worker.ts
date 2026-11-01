// A throwaway Worker for scripts/measure-password-cost.mjs: it runs the
// product's own hashPassword and verifyPassword (src/auth/password.ts) in the
// local Workers runtime (workerd, through `wrangler dev`) and reports how long
// they took. Never deployed; it has no bindings and no routes of the product.
//
// GET /?op=hash|verify&iterations=N&reps=R
//   -> { op, iterations, reps, msEach } where msEach is the mean of R runs.
// Locally, workerd's clock advances during computation, so performance.now()
// inside the Worker measures the work. (On Cloudflare's edge the clock is held
// still while code runs, which is why the live check uses Workers Logs.)
import { hashPassword, verifyPassword } from '../src/auth/password.ts';

const PASSWORD = 'measure-password-cost';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const op = url.searchParams.get('op');
    const iterations = Number(url.searchParams.get('iterations'));
    const reps = Math.max(1, Math.min(50, Number(url.searchParams.get('reps') ?? '1') || 1));
    if (op !== 'hash' && op !== 'verify') return new Response('op must be hash or verify', { status: 400 });
    const stored = await hashPassword(PASSWORD, iterations); // also refuses a count outside the floor and ceiling
    const started = performance.now();
    for (let i = 0; i < reps; i++) {
      if (op === 'hash') await hashPassword(PASSWORD, iterations);
      else if (!(await verifyPassword(PASSWORD, stored))) return new Response('verify failed', { status: 500 });
    }
    const msEach = (performance.now() - started) / reps;
    return Response.json({ op, iterations, reps, msEach });
  },
};
