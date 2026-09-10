/**
 * StatusList2021 bitstring encoding.
 *
 * `revocation-list.encodedList` used to be a comma-separated list of revoked
 * indices - readable, and fine for our own `/verify` page, which decoded it
 * with `split(',')`. It is not what the specification says the field holds, so
 * any third-party verifier that fetched our status list would fail to parse it
 * and could not confirm a revocation. That is the one thing a verifiable
 * credential is supposed to make possible without asking us.
 *
 * The real format (W3C StatusList2021, §Bitstring Generation) is a bitstring
 * where bit `i` is set if the credential holding index `i` is revoked,
 * GZIP-compressed and then base64url-encoded. Two details are easy to get
 * wrong and both make the list silently misread rather than fail:
 *
 *  - **Bit order is most-significant-first.** Index 0 is `0b10000000` of byte
 *    0, index 7 is `0b00000001` of byte 0, index 8 is `0b10000000` of byte 1.
 *    This matches the reference implementations; LSB-first would decode to a
 *    different set of revoked credentials rather than to an error.
 *  - **The bitstring has a 16KB minimum**, so a list with one revoked
 *    credential does not leak how many credentials an issuer has issued.
 *    GZIP takes the padding back down to a couple of hundred bytes.
 *
 * No multibase prefix: StatusList2021 specifies plain base64url. (Its
 * successor, Bitstring Status List v1.0, prefixes a multibase `u` - if the
 * emitted `credentialStatus.type` is ever moved to `BitstringStatusListEntry`,
 * that prefix has to be added at the same time.)
 */

import zlib from 'zlib'

/**
 * The specification's minimum size, in bytes: 16KB, or 131,072 entries. Lists
 * grow beyond it in whole bytes as higher indices are revoked.
 */
export const MIN_STATUS_LIST_BYTES = 16 * 1024

/** Entries addressable by a list of the minimum size. */
export const MIN_STATUS_LIST_ENTRIES = MIN_STATUS_LIST_BYTES * 8

/**
 * Whether a stored `encodedList` is in the pre-bitstring format: a
 * comma-separated list of decimal indices, or the empty string that
 * `createStatusListCredential` used to seed a new list with.
 *
 * Deliberately strict. A base64url bitstring can consist entirely of digits
 * and commas only if it contains a comma, which base64url never does, so the
 * two formats cannot be confused - but a loose test that treated an
 * unparseable value as legacy would make a corrupt list read as "nothing is
 * revoked", which is the wrong way to fail.
 */
export function isLegacyIndexList(encodedList: string): boolean {
  if (encodedList === '') return true
  return /^\d+(\s*,\s*\d+)*$/.test(encodedList.trim())
}

/** The revoked indices held in a pre-bitstring `encodedList`. */
export function parseLegacyIndexList(encodedList: string): number[] {
  if (!encodedList || encodedList.trim() === '') return []
  return encodedList
    .split(',')
    .map(part => Number.parseInt(part.trim(), 10))
    .filter(index => Number.isInteger(index) && index >= 0)
}

/**
 * A GZIP-compressed, base64url-encoded bitstring with the given indices set.
 *
 * The buffer is sized to hold the highest index given, never below the 16KB
 * minimum, so encoding is a pure function of the index set: the same set
 * always produces the same string, whatever order it arrives in.
 */
export function encodeStatusList(indices: Iterable<number>): string {
  const set = new Set<number>()
  let highest = -1

  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Status list index must be a non-negative integer, got ${index}`)
    }
    set.add(index)
    if (index > highest) highest = index
  }

  const requiredBytes = highest < 0 ? 0 : Math.floor(highest / 8) + 1
  const bitstring = Buffer.alloc(Math.max(MIN_STATUS_LIST_BYTES, requiredBytes))

  for (const index of set) {
    bitstring[Math.floor(index / 8)] |= 0b1000_0000 >> (index % 8)
  }

  return zlib.gzipSync(bitstring).toString('base64url')
}

/**
 * The bitstring behind an `encodedList`, or null if it cannot be read.
 *
 * Returning null rather than throwing lets a caller decide: verification
 * treats an unreadable list as "cannot confirm" instead of as "not revoked",
 * which is the safer of the two readings and the reason this does not
 * silently produce an empty buffer.
 */
function decodeBitstring(encodedList: string): Buffer | null {
  try {
    return zlib.gunzipSync(Buffer.from(encodedList, 'base64url'))
  } catch {
    return null
  }
}

/**
 * Whether `index` is revoked according to `encodedList`, in either format.
 *
 * An index beyond the end of the bitstring is not revoked - the list simply
 * has not grown that far, which is normal for a freshly created list.
 */
export function statusListHasIndex(encodedList: string, index: number): boolean {
  if (!encodedList) return false

  if (isLegacyIndexList(encodedList)) {
    return parseLegacyIndexList(encodedList).includes(index)
  }

  const bitstring = decodeBitstring(encodedList)
  if (!bitstring) {
    throw new Error('Status list could not be decoded: not a GZIP-compressed base64url bitstring')
  }

  const byteIndex = Math.floor(index / 8)
  if (byteIndex >= bitstring.length) return false

  return (bitstring[byteIndex] & (0b1000_0000 >> (index % 8))) !== 0
}

/**
 * Every revoked index in an `encodedList`, in either format.
 *
 * Used when re-encoding a list to add an index, and by the tests. Scanning
 * 16KB byte by byte is 131,072 bit tests; the whole-byte skip keeps an
 * almost-empty list (which is every real list) to 16,384 comparisons.
 */
export function decodeStatusList(encodedList: string): number[] {
  if (!encodedList) return []

  if (isLegacyIndexList(encodedList)) {
    return parseLegacyIndexList(encodedList).sort((a, b) => a - b)
  }

  const bitstring = decodeBitstring(encodedList)
  if (!bitstring) {
    throw new Error('Status list could not be decoded: not a GZIP-compressed base64url bitstring')
  }

  const indices: number[] = []
  for (let byteIndex = 0; byteIndex < bitstring.length; byteIndex++) {
    const byte = bitstring[byteIndex]
    if (byte === 0) continue
    for (let bit = 0; bit < 8; bit++) {
      if (byte & (0b1000_0000 >> bit)) indices.push(byteIndex * 8 + bit)
    }
  }

  return indices
}
