// The theme save is ordered so that a failure can never leave a new logo with
// the old colour (carried note from task 5): the new logo is written under a
// new key, the database switches colour and logo together in one statement,
// and only then is the old logo removed. If the database write fails, the old
// logo and the old colour both stay, and the new object is cleaned up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveTheme, logoKey, type ThemeStore } from '../../src/theme.ts';

const OLD = Uint8Array.from([1, 1, 1]);
const NEW = Uint8Array.from([2, 2, 2]);

/** An in-memory R2 bucket and kit row; run() applies the theme UPDATEs the way json_set would. */
function fakeStore(opts: { failDb?: boolean } = {}) {
  const objects = new Map<string, Uint8Array>([[logoKey('s1'), OLD]]);
  const kit = { primaryColor: '#111111', logoKey: logoKey('s1') as string | null, logoType: 'image/png' as string | null };
  const store: ThemeStore = {
    files: {
      put: (async (key: string, value: Uint8Array) => { objects.set(key, value); return null; }) as unknown as ThemeStore['files']['put'],
      delete: (async (keys: string | string[]) => { for (const k of [keys].flat()) objects.delete(k); }) as ThemeStore['files']['delete'],
    },
    async run(sql, ...params) {
      if (opts.failDb) throw new Error('D1 unavailable');
      assert.match(sql, /^UPDATE kit SET json = json_set\(json, /);
      kit.primaryColor = String(params[0]);
      if (sql.includes('$.theme.logoKey')) {
        kit.logoKey = String(params[1]);
        kit.logoType = String(params[2]);
      }
      return 1;
    },
  };
  return { store, objects, kit };
}

const change = { spaceId: 's1', kitId: 'k1', colour: '#AA0000', logo: { bytes: NEW, type: 'image/png' }, currentLogoKey: logoKey('s1') };

test('theme save: when the database write fails, the old logo and the old colour both stay, and no new object is left behind', async () => {
  const { store, objects, kit } = fakeStore({ failDb: true });
  await assert.rejects(saveTheme(store, change), /D1 unavailable/);
  assert.equal(kit.primaryColor, '#111111', 'the colour is unchanged');
  assert.equal(kit.logoKey, logoKey('s1'), 'the kit still points to the old logo');
  assert.deepEqual(objects.get(kit.logoKey!), OLD, 'and the old logo is still there, unchanged');
  assert.deepEqual([...objects.keys()], [logoKey('s1')], 'the new logo object was cleaned up');
});

test('theme save: on success the kit points to the new logo with the new colour, and the old logo is removed', async () => {
  const { store, objects, kit } = fakeStore();
  await saveTheme(store, change);
  assert.equal(kit.primaryColor, '#aa0000');
  assert.ok(kit.logoKey?.startsWith('spaces/s1/'), `the logo stays inside the space's own prefix (${kit.logoKey})`);
  assert.deepEqual(objects.get(kit.logoKey!), NEW, 'the kit points to the new logo');
  assert.deepEqual([...objects.keys()], [kit.logoKey], 'exactly one logo object is stored for the space');
});

test('theme save: a colour-only save touches no file', async () => {
  const { store, objects, kit } = fakeStore();
  await saveTheme(store, { ...change, logo: null });
  assert.equal(kit.primaryColor, '#aa0000');
  assert.equal(kit.logoKey, logoKey('s1'));
  assert.deepEqual([...objects.entries()], [[logoKey('s1'), OLD]]);
});
