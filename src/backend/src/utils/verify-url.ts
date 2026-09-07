/**
 * The two URLs a certificate needs: the page a person is sent to, and the
 * shorter payload its QR code carries.
 *
 * They differ because a QR code's module count grows with the data, and the
 * seal on the certificate is a fixed 124pt across. Fewer characters means
 * fewer, larger modules, and the difference decides whether a phone can read
 * it at all:
 *
 *   https://host/credentials/urn%3Auuid%3A<uuid>   89 chars, byte mode, v9,
 *                                                  53x53 modules, 0.45mm each
 *   HTTPS://HOST/V/<32 hex chars>                  62 chars, alphanumeric,
 *                                                  v5, 37x37, 0.61mm each
 *
 * Two things buy that. The `urn:uuid:` prefix and the dashes are redundant -
 * the hex alone identifies the credential and the rest can be rebuilt - and
 * uppercasing moves the payload from byte mode (8 bits a character) into QR's
 * alphanumeric mode (11 bits per two characters), whose alphabet is digits,
 * A-Z and a handful of symbols including `:`, `/` and `.`.
 *
 * Uppercase is safe to send: RFC 3986 makes the scheme and host
 * case-insensitive, and the path is matched case-insensitively by the redirect
 * that receives it (see the frontend's server/middleware/short-verify.ts).
 *
 * The short form is used only when it is certainly equivalent. A credential
 * imported from elsewhere may carry an id that is not a `urn:uuid:`, and a
 * deployment may be served from a sub-path, whose case we must not touch -
 * both fall back to the full URL, which is longer but always correct.
 */

/** `urn:uuid:` followed by a canonical UUID, captured in its five groups. */
const URN_UUID = /^urn:uuid:([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i

const withoutTrailingSlash = (value: string): string => value.replace(/\/+$/, '')

/**
 * Where a person reads and verifies the credential. Canonical, and what the
 * QR falls back to.
 *
 * @param {string} frontendUrl - Origin the Nuxt app is served from
 * @param {string} credentialId - The credential's public identifier
 */
export function credentialPageUrl(frontendUrl: string, credentialId: string): string {
  return `${withoutTrailingSlash(frontendUrl)}/credentials/${encodeURIComponent(credentialId)}`
}

/**
 * What the certificate's QR code encodes.
 *
 * @param {string} frontendUrl - Origin the Nuxt app is served from
 * @param {string} credentialId - The credential's public identifier
 */
export function qrPayloadUrl(frontendUrl: string, credentialId: string): string {
  const groups = URN_UUID.exec(String(credentialId).trim())

  if (!groups) {
    return credentialPageUrl(frontendUrl, credentialId)
  }

  let origin: URL

  try {
    origin = new URL(frontendUrl)
  } catch {
    return credentialPageUrl(frontendUrl, credentialId)
  }

  // A sub-path deployment (https://example.org/badges) cannot be uppercased -
  // path segments are case-sensitive and only the redirect's own is known to
  // tolerate it.
  if (withoutTrailingSlash(origin.pathname) !== '') {
    return credentialPageUrl(frontendUrl, credentialId)
  }

  const hex = groups.slice(1).join('')

  return `${origin.protocol}//${origin.host}/v/${hex}`.toUpperCase()
}
