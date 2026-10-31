// Test-only data setup for AT-4 and later tests. The owner part goes through
// the real pages (setup, new space, appoint admin); everything the admin and
// publisher screens will create later (people, groups, subjects, content) goes
// through the test-only route /__test/seed, which exists only in test builds
// (see src/test-hooks.ts and test/guards/production-guard.test.ts).
import assert from 'node:assert/strict';
import { Client, tinyPng } from './http.ts';

export interface SeedPerson {
  username: string;
  password: string;
  display_name: string;
  mobile: string;
  role: 'admin' | 'publisher' | 'learner';
  valid_until: string;
}

export type SeedMaterial =
  | { kind: 'pdf' | 'image'; title: string; base64: string; contentType: string; position?: number }
  | { kind: 'video_link' | 'link'; title: string; url: string; position?: number }
  | { kind: 'note'; title: string; text: string; position?: number };

export interface SeedSubject {
  title: string;
  publisher?: string;
  published: boolean;
  groups?: string[];
  users?: string[];
  chapters?: {
    title: string;
    position?: number;
    lessons?: { title: string; body?: string; position?: number; materials?: SeedMaterial[] }[];
  }[];
}

export interface SeedRequest {
  spaceId: string;
  grantedBy: string;
  people?: SeedPerson[];
  groups?: { name: string; members: string[] }[];
  subjects?: SeedSubject[];
}

export interface SeededLesson {
  id: string;
  materials: Record<string, string>;
}
export interface SeededSubject {
  id: string;
  chapters: Record<string, { id: string; lessons: Record<string, SeededLesson> }>;
}
export interface SeedResult {
  users: Record<string, string>;
  groups: Record<string, string>;
  subjects: Record<string, SeededSubject>;
}

export async function seed(base: string, body: SeedRequest): Promise<SeedResult> {
  const res = await fetch(base + '/__test/seed', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  assert.equal(res.status, 200, `test seeding failed (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text) as SeedResult;
}

export const OWNER = { username: 'owner', password: 'owner-pass-2026', mobile: '+201000000001' };

/** Creates the owner account (first setup) and returns a signed-in client. */
export async function setUpOwner(base: string): Promise<Client> {
  const c = new Client(base);
  const res = await c.post('/setup', OWNER);
  assert.equal(res.status, 200, 'owner setup');
  return c;
}

/** Creates a space through the owner's real form; returns its id. */
export async function createSpace(
  owner: Client,
  v: { name: string; kit: 'school' | 'company' | 'university'; languages?: 'ar,en' | 'en,ar'; color?: string },
): Promise<string> {
  const f = new FormData();
  f.set('name', v.name);
  f.set('kit', v.kit);
  f.set('languages', v.languages ?? 'ar,en');
  f.set('primary_color', v.color ?? '#0b6e4f');
  f.set('country_code', '+20');
  f.set('logo', new Blob([tinyPng()], { type: 'image/png' }), 'logo.png');
  const res = await owner.post('/owner/spaces', f);
  assert.equal(res.status, 302, 'space created');
  const id = (res.headers.get('location') ?? '').split('/').pop() ?? '';
  assert.ok(id, 'space id in the redirect');
  return id;
}

/** Appoints an admin through the owner's real form. */
export async function appointAdmin(
  owner: Client,
  spaceId: string,
  v: { display_name: string; username: string; password: string; mobile: string; valid_until: string },
): Promise<void> {
  const res = await owner.post(`/owner/spaces/${spaceId}/admins`, v);
  assert.equal(res.status, 302, `admin ${v.username} appointed`);
}

export async function signedIn(base: string, username: string, password: string): Promise<Client> {
  const c = new Client(base);
  const res = await c.post('/signin', { username, password });
  assert.equal(res.status, 302, `${username} signs in`);
  return c;
}

/** A real one-page PDF (valid cross-reference table), built in code so no
 * binary fixture is committed. */
export function tinyPdf(text = 'Adding fractions'): Uint8Array {
  const stream = `BT /F1 24 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

export const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
