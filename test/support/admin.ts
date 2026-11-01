// Request-level helpers for the admin's and owner's real forms (task 4, AT-2):
// appointing a person, issuing a one-time reset link, and reading what the
// confirmation step shows. The browser journey is in test/at2; these are for
// the guard tests, which check status codes and stored rows.
import assert from 'node:assert/strict';
import type { Client } from './http.ts';
import type { RunningWorker } from './worker.ts';

export interface PersonValues {
  display_name: string;
  username: string;
  password: string;
  role: 'publisher' | 'learner';
  mobile: string;
  valid_until: string;
}

/** Appoints a person through the admin's form; returns their user id. */
export async function appointPerson(worker: RunningWorker, admin: Client, spaceId: string, p: PersonValues): Promise<string> {
  const res = await admin.post(`/s/${spaceId}/admin/people`, { ...p });
  assert.equal(res.status, 303, `${p.username} appointed (got ${res.status})`);
  return userIdOf(worker, p.username);
}

export async function userIdOf(worker: RunningWorker, username: string): Promise<string> {
  const rows = await worker.sql(`SELECT id FROM user WHERE username = '${username}'`);
  assert.equal(rows.length, 1, `user ${username} exists`);
  return String(rows[0].id);
}

export interface IssuedLink {
  status: number;
  html: string;
  /** The reset link as the Copy button holds it. */
  link: string;
  token: string;
  /** The WhatsApp button's address. */
  href: string;
  /** The WhatsApp message, decoded. */
  message: string;
  /** The number the WhatsApp button sends to (digits only). */
  number: string;
}

const attr = (html: string, id: string, name: string) =>
  html.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`))?.[0].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '';

const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Reads the result of the confirming tap: the WhatsApp button and the Copy button. */
export function readIssued(status: number, html: string): IssuedLink {
  const link = unescape(attr(html, 'reset-link', 'value'));
  const href = unescape(attr(html, 'whatsapp', 'href'));
  let message = '';
  let number = '';
  if (href) {
    const u = new URL(href);
    number = u.pathname.slice(1);
    message = u.searchParams.get('text') ?? '';
  }
  return { status, html, link, token: link.split('/').pop() ?? '', href, message, number };
}

/** Presses the confirming tap (POST) on a person's reset-link step, at the given base path
 * (/s/<space>/admin/people/<user> or /owner/spaces/<space>/people/<user>). */
export async function issueLink(client: Client, personPath: string, extra: Record<string, string> = {}): Promise<IssuedLink> {
  const res = await client.post(`${personPath}/link`, extra);
  return readIssued(res.status, await res.text());
}
