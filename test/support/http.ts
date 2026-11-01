// A tiny HTTP client with a cookie jar, for request-level checks (status codes,
// headers) that a browser hides. Forms are posted the way a browser posts them,
// including the Origin header.

export class Client {
  readonly base: string;
  private cookies = new Map<string, string>();
  lastSetCookie: string[] = [];

  constructor(base: string) {
    this.base = base;
  }

  private remember(res: Response): void {
    this.lastSetCookie = res.headers.getSetCookie();
    for (const line of this.lastSetCookie) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '' || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    return { ...(cookie ? { cookie } : {}), ...extra };
  }

  async get(path: string): Promise<Response> {
    const res = await fetch(this.base + path, { redirect: 'manual', headers: this.headers() });
    this.remember(res);
    return res;
  }

  async post(path: string, fields: Record<string, string> | FormData): Promise<Response> {
    const body = fields instanceof FormData ? fields : new URLSearchParams(fields);
    const res = await fetch(this.base + path, {
      method: 'POST',
      redirect: 'manual',
      body,
      headers: this.headers({ origin: this.base }),
    });
    this.remember(res);
    return res;
  }

  /** Posts with this client's cookies but the given request headers in place
   * of the browser's Origin (a forged cross-site form, or one with no Origin). */
  async postWith(path: string, fields: Record<string, string> | FormData, headers: Record<string, string>): Promise<Response> {
    const body = fields instanceof FormData ? fields : new URLSearchParams(fields);
    const res = await fetch(this.base + path, { method: 'POST', redirect: 'manual', body, headers: this.headers(headers) });
    this.remember(res);
    return res;
  }

  async postRaw(path: string, init: RequestInit): Promise<Response> {
    const res = await fetch(this.base + path, { redirect: 'manual', ...init });
    this.remember(res);
    return res;
  }

  has(name: string): boolean {
    return this.cookies.has(name);
  }
}

// Where a test run starts the Worker's clock. Normally at the real time (0).
// A reproduction can start it elsewhere (LMS_TEST_CLOCK_START, see
// test/support/worker.ts): every relative move below is then made from that
// starting point, as if the run had begun at that time of day.
const startOffsets = new Map<string, number>();

export function setStartOffset(base: string, ms: number): void {
  startOffsets.set(base, ms);
}

function postClock(base: string, offsetMs: number): Promise<Response> {
  return fetch(base + '/__test/clock', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ offsetMs }),
  });
}

/** Moves the Worker's clock by whole days from where the run started (test builds only). */
export async function setClockOffsetDays(base: string, days: number): Promise<Response> {
  return postClock(base, (startOffsets.get(base) ?? 0) + days * 86_400_000);
}

/** Moves the Worker's clock by milliseconds from where the run started (test builds only). */
export async function setClockOffsetMs(base: string, ms: number): Promise<Response> {
  return postClock(base, (startOffsets.get(base) ?? 0) + ms);
}

/** Sets the Worker's clock to an exact instant (test builds only). The Worker
 * runs on this machine, so its clock is this machine's clock plus the offset. */
export async function setClockTo(base: string, atMs: number): Promise<Response> {
  return postClock(base, atMs - Date.now());
}

/** The Worker's own time now (test builds only). */
export async function workerNow(base: string): Promise<number> {
  const res = await fetch(base + '/__test/clock');
  if (res.status !== 200) throw new Error(`the test clock did not answer (${res.status})`);
  const { now } = (await res.json()) as { now: string };
  return Date.parse(now);
}

export function utcDatePlusDays(days: number, from = Date.now()): string {
  return new Date(from + days * 86_400_000).toISOString().slice(0, 10);
}

/** A valid 16x16 PNG (green), kept inline so no binary fixture is committed. */
export function tinyPng(): Uint8Array {
  return Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGPgzvMnCTGMahjVMHw1AAAQ/sgBnMi6gAAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
}
