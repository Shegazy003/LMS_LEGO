// Password hashing (PBKDF2 via Web Crypto). Not implemented yet.
export const PBKDF2_ITERATIONS: number = 0;
export async function hashPassword(_password: string): Promise<string> {
  throw new Error('not implemented');
}
export async function verifyPassword(_password: string, _stored: string): Promise<boolean> {
  throw new Error('not implemented');
}
