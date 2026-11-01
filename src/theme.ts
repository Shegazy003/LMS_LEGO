// Saving a space's theme (colour, and a logo when one is sent) from the
// owner's theme form, in an order that a failure cannot break:
//   1. the new logo is written under a NEW key (the old object is untouched);
//   2. one database statement switches colour, logo key and logo type
//      together;
//   3. only then is the old logo object removed.
// If step 2 fails, the old logo and the old colour both stay, and the new
// object is removed again. If step 3 fails, the space already shows the new
// logo and colour; the old object is only left over (counted in storage).
export const logoKey = (spaceId: string) => `spaces/${spaceId}/logo`;
const newLogoKey = (spaceId: string) => `spaces/${spaceId}/logo-${crypto.randomUUID()}`;

/** The logo object of a space, read from its kit; never one outside the space's own prefix. */
export function storedLogoKey(spaceId: string, kitLogoKey: string | null): string | null {
  return kitLogoKey && kitLogoKey.startsWith(`spaces/${spaceId}/logo`) && !kitLogoKey.includes('..') ? kitLogoKey : null;
}

export interface ThemeStore {
  files: Pick<R2Bucket, 'put' | 'delete'>;
  run(sql: string, ...params: (string | number | null)[]): Promise<number>;
}

export interface ThemeChange {
  spaceId: string;
  kitId: string;
  colour: string;
  logo: { bytes: Uint8Array; type: string } | null;
  /** The logo object the kit points to now, if any. */
  currentLogoKey: string | null;
}

export async function saveTheme(store: ThemeStore, change: ThemeChange): Promise<void> {
  const colour = change.colour.toLowerCase();
  if (!change.logo) {
    await store.run(`UPDATE kit SET json = json_set(json, '$.theme.primaryColor', ?) WHERE id = ?`, colour, change.kitId);
    return;
  }
  const key = newLogoKey(change.spaceId);
  await store.files.put(key, change.logo.bytes, { httpMetadata: { contentType: change.logo.type } });
  try {
    await store.run(
      `UPDATE kit SET json = json_set(json, '$.theme.primaryColor', ?, '$.theme.logoKey', ?, '$.theme.logoType', ?) WHERE id = ?`,
      colour, key, change.logo.type, change.kitId,
    );
  } catch (err) {
    await store.files.delete(key).catch(() => undefined);
    throw err;
  }
  const old = storedLogoKey(change.spaceId, change.currentLogoKey);
  if (old && old !== key) await store.files.delete(old).catch(() => undefined);
}
