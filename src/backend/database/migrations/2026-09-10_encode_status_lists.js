'use strict';

/**
 * Converts `revocation_lists.encoded_list` from a comma-separated list of
 * revoked indices to a StatusList2021 bitstring.
 *
 * The old format was ours, not the specification's, so a third-party verifier
 * that fetched a status list could not parse it. See src/utils/status-list.ts
 * for the encoding and item 43 in docs/known-issues-and-dev-notes.md for why.
 *
 * The service reads either format, so this migration is not what makes the
 * app work - it is what makes the *published* list at /api/status-lists/:id
 * correct for lists that already exist. Without it, an issuer who has revoked
 * something before the upgrade would serve a bitstring-shaped endpoint holding
 * "3,17".
 *
 * Deliberately not written with the util it mirrors: migrations are plain
 * CommonJS `.js` and are not compiled into `dist` (item 40), so importing
 * from `src/utils` would resolve at runtime against TypeScript source. The
 * encoder is 15 lines; the duplication is the lesser problem, and the test in
 * src/utils/__tests__/status-list.test.ts asserts the two agree.
 */

const zlib = require('zlib');

const MIN_STATUS_LIST_BYTES = 16 * 1024;

/** Mirrors encodeStatusList() in src/utils/status-list.ts - MSB-first bits. */
function encodeStatusList(indices) {
  const set = new Set(indices);
  let highest = -1;
  for (const index of set) {
    if (index > highest) highest = index;
  }

  const requiredBytes = highest < 0 ? 0 : Math.floor(highest / 8) + 1;
  const bitstring = Buffer.alloc(Math.max(MIN_STATUS_LIST_BYTES, requiredBytes));

  for (const index of set) {
    bitstring[Math.floor(index / 8)] |= 0b10000000 >> (index % 8);
  }

  return zlib.gzipSync(bitstring).toString('base64url');
}

/** An empty string counts: that is what a new list used to be seeded with. */
function isLegacyIndexList(value) {
  if (value === '') return true;
  return /^\d+(\s*,\s*\d+)*$/.test(String(value).trim());
}

module.exports = {
  async up(knex) {
    const hasTable = await knex.schema.hasTable('revocation_lists');
    if (!hasTable) {
      console.log('revocation_lists does not exist yet, skipping (will be created by schema sync)');
      return;
    }

    const rows = await knex('revocation_lists').select('id', 'encoded_list');

    // Only the ones still in the old format, so re-running this is a no-op
    // and a list already converted is never re-encoded.
    const legacy = rows.filter(row => row.encoded_list === null || isLegacyIndexList(row.encoded_list));

    if (legacy.length === 0) {
      console.log(`revocation_lists: ${rows.length} list(s), none in the legacy index format`);
      return;
    }

    for (const row of legacy) {
      const indices = String(row.encoded_list || '')
        .split(',')
        .map(part => Number.parseInt(part.trim(), 10))
        .filter(index => Number.isInteger(index) && index >= 0);

      await knex('revocation_lists')
        .where({ id: row.id })
        .update({ encoded_list: encodeStatusList(indices) });

      console.log(`revocation_lists: list ${row.id} encoded ${indices.length} revoked index/indices as a bitstring`);
    }

    console.log(`revocation_lists: converted ${legacy.length} of ${rows.length} list(s)`);
  },

  async down(knex) {
    // Reversible, and worth being: rolling the application back without also
    // restoring this format would leave the old `split(',')` reader parsing a
    // bitstring, which yields NaN and reports every revoked credential as
    // valid. Only the revoked indices are carried, which is all the old
    // format could hold.
    const hasTable = await knex.schema.hasTable('revocation_lists');
    if (!hasTable) return;

    const rows = await knex('revocation_lists').select('id', 'encoded_list');

    for (const row of rows) {
      if (!row.encoded_list || isLegacyIndexList(row.encoded_list)) continue;

      let bitstring;
      try {
        bitstring = zlib.gunzipSync(Buffer.from(row.encoded_list, 'base64url'));
      } catch {
        console.log(`revocation_lists: list ${row.id} is not a readable bitstring, leaving it alone`);
        continue;
      }

      const indices = [];
      for (let byteIndex = 0; byteIndex < bitstring.length; byteIndex++) {
        const byte = bitstring[byteIndex];
        if (byte === 0) continue;
        for (let bit = 0; bit < 8; bit++) {
          if (byte & (0b10000000 >> bit)) indices.push(byteIndex * 8 + bit);
        }
      }

      await knex('revocation_lists')
        .where({ id: row.id })
        .update({ encoded_list: indices.join(',') });
    }
  },
};
