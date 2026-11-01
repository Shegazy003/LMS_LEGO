// Saving a space's theme (colour, and a logo when one is sent) from the
// owner's theme form.
export const logoKey = (spaceId: string) => `spaces/${spaceId}/logo`;

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
  await store.files.put(logoKey(change.spaceId), change.logo.bytes, { httpMetadata: { contentType: change.logo.type } });
  await store.run(
    `UPDATE kit SET json = json_set(json, '$.theme.primaryColor', ?, '$.theme.logoKey', ?, '$.theme.logoType', ?) WHERE id = ?`,
    colour, logoKey(change.spaceId), change.logo.type, change.kitId,
  );
}
