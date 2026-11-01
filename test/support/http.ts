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

/** Moves the Worker's clock (test builds only). */
export async function setClockOffsetDays(base: string, days: number): Promise<Response> {
  return fetch(base + '/__test/clock', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ offsetMs: days * 86_400_000 }),
  });
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
