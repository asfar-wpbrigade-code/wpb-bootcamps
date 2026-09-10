import zlib from 'zlib'
import path from 'path'
import {
  MIN_STATUS_LIST_BYTES,
  decodeStatusList,
  encodeStatusList,
  isLegacyIndexList,
  parseLegacyIndexList,
  statusListHasIndex,
} from '../status-list'

describe('status list encoding', () => {
  it('round-trips an index set', () => {
    const indices = [0, 1, 7, 8, 9, 4095, 131071]
    expect(decodeStatusList(encodeStatusList(indices))).toEqual(indices)
  })

  it('encodes an empty list as a valid bitstring, not an empty string', () => {
    const encoded = encodeStatusList([])

    expect(encoded).not.toBe('')
    expect(decodeStatusList(encoded)).toEqual([])
    // A verifier fetching a brand-new list has to be able to parse it.
    expect(() => statusListHasIndex(encoded, 0)).not.toThrow()
    expect(statusListHasIndex(encoded, 0)).toBe(false)
  })

  it('sets bits most-significant-first, as the specification requires', () => {
    // Index 0 is the top bit of byte 0, index 7 the bottom bit of byte 0, and
    // index 8 the top bit of byte 1. LSB-first would put index 0 at 0x01 and
    // decode to a different set of revoked credentials rather than failing.
    const bitstring = zlib.gunzipSync(Buffer.from(encodeStatusList([0, 7, 8]), 'base64url'))

    expect(bitstring[0]).toBe(0b1000_0001)
    expect(bitstring[1]).toBe(0b1000_0000)
  })

  it('pads to the 16KB minimum so the list does not leak how much was issued', () => {
    const bitstring = zlib.gunzipSync(Buffer.from(encodeStatusList([2]), 'base64url'))

    expect(bitstring.length).toBe(MIN_STATUS_LIST_BYTES)
  })

  it('grows past the minimum for a high index', () => {
    const highest = MIN_STATUS_LIST_BYTES * 8 + 9
    const bitstring = zlib.gunzipSync(Buffer.from(encodeStatusList([highest]), 'base64url'))

    expect(bitstring.length).toBeGreaterThan(MIN_STATUS_LIST_BYTES)
    expect(statusListHasIndex(encodeStatusList([highest]), highest)).toBe(true)
  })

  it('compresses the padding away', () => {
    // The point of gzip here: 16KB of mostly-zero bytes is a few hundred
    // bytes on the wire, so the minimum size costs a verifier nothing.
    expect(encodeStatusList([3]).length).toBeLessThan(1024)
  })

  it('does not depend on the order indices arrive in', () => {
    expect(encodeStatusList([9, 2, 40])).toBe(encodeStatusList([40, 9, 2]))
  })

  it('is idempotent about duplicates', () => {
    expect(encodeStatusList([5, 5, 5])).toBe(encodeStatusList([5]))
  })

  it('refuses a negative or fractional index', () => {
    expect(() => encodeStatusList([-1])).toThrow(/non-negative integer/)
    expect(() => encodeStatusList([1.5])).toThrow(/non-negative integer/)
  })

  it('reports an index beyond the end of the bitstring as not revoked', () => {
    // A list that has not grown that far, which is every new list.
    expect(statusListHasIndex(encodeStatusList([1]), MIN_STATUS_LIST_BYTES * 8 + 100)).toBe(false)
  })

  it('throws rather than answering false for an unreadable list', () => {
    // Fails closed: callers turn this into "revocation cannot be confirmed",
    // never into "the credential is valid".
    expect(() => statusListHasIndex('not-a-bitstring!!', 0)).toThrow(/could not be decoded/)
    expect(() => decodeStatusList('not-a-bitstring!!')).toThrow(/could not be decoded/)
  })
})

describe('legacy index lists', () => {
  it('recognises the old comma-separated format', () => {
    expect(isLegacyIndexList('')).toBe(true)
    expect(isLegacyIndexList('0')).toBe(true)
    expect(isLegacyIndexList('3,17')).toBe(true)
    expect(isLegacyIndexList(' 3 , 17 ')).toBe(true)
  })

  it('does not mistake a bitstring for one', () => {
    // base64url has no commas, so the two formats cannot collide - but this
    // is the assumption the whole dual-read rests on.
    expect(isLegacyIndexList(encodeStatusList([1, 2, 3]))).toBe(false)
    expect(encodeStatusList([1, 2, 3])).not.toContain(',')
  })

  it('reads a list written before the bitstring change', () => {
    // Credentials issued against these lists are still in the wild.
    expect(statusListHasIndex('3,17', 17)).toBe(true)
    expect(statusListHasIndex('3,17', 4)).toBe(false)
    expect(decodeStatusList('17,3')).toEqual([3, 17])
    expect(parseLegacyIndexList('3, 17')).toEqual([3, 17])
  })

  it('treats an empty legacy list as nothing revoked', () => {
    expect(statusListHasIndex('', 0)).toBe(false)
    expect(decodeStatusList('')).toEqual([])
  })
})

describe('the migration copy of the encoder', () => {
  // database/migrations/*.js cannot import from src/utils: migrations are
  // plain CommonJS and are not compiled into dist (item 40), so the encoder
  // is duplicated there. This is the test that keeps the copy honest.
  const migration = require(
    path.join(__dirname, '../../../database/migrations/2026-09-10_encode_status_lists.js')
  )

  it('exists as a migration with up and down', () => {
    expect(typeof migration.up).toBe('function')
    expect(typeof migration.down).toBe('function')
  })

  it('produces byte-identical output to the util', async () => {
    const cases = [[], [0], [3, 17], [7, 8, 9], [131071]]

    // Driven through the migration itself rather than by reaching for its
    // private encoder, so what is compared is what actually gets written.
    for (const indices of cases) {
      const rows = [{ id: 1, encoded_list: indices.join(',') }]
      let written: string | undefined

      const knex: any = (table: string) => {
        expect(table).toBe('revocation_lists')
        return {
          select: async () => rows,
          where: () => ({
            update: async (data: any) => {
              written = data.encoded_list
            },
          }),
        }
      }
      knex.schema = { hasTable: async () => true }

      await migration.up(knex)

      expect(written).toBe(encodeStatusList(indices))
    }
  })

  it('leaves a list that is already a bitstring alone', async () => {
    const rows = [{ id: 1, encoded_list: encodeStatusList([5]) }]
    let updated = false

    const knex: any = () => ({
      select: async () => rows,
      where: () => ({ update: async () => { updated = true } }),
    })
    knex.schema = { hasTable: async () => true }

    await migration.up(knex)

    expect(updated).toBe(false)
  })

  it('rolls back to the old format', async () => {
    const rows = [{ id: 1, encoded_list: encodeStatusList([3, 17]) }]
    let written: string | undefined

    const knex: any = () => ({
      select: async () => rows,
      where: () => ({ update: async (data: any) => { written = data.encoded_list } }),
    })
    knex.schema = { hasTable: async () => true }

    await migration.down(knex)

    expect(written).toBe('3,17')
  })
})
