// Bounds on what people type as a username or a display name (task 5).
// Scaffolding only: the behaviour is implemented with the green commit.
export const USERNAME_MAX = 32;
export const DISPLAY_NAME_MAX = 100;

export function isUsername(_text: string): boolean {
  throw new Error('not implemented');
}

export function typedUsername(_raw: string): string {
  throw new Error('not implemented');
}

export function cleanDisplayName(_raw: string): string | null {
  throw new Error('not implemented');
}
