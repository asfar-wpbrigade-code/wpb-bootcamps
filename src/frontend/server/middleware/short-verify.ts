/**
 * `/v/<32 hex characters>` - the address printed as a QR code on every
 * certificate - redirected to the credential page it stands for.
 *
 * The QR carries this short, uppercase form because the seal it is printed
 * inside is only 124pt across: dropping `credentials/`, the `urn:uuid:` prefix
 * and the UUID's dashes, and uppercasing what is left so the payload encodes
 * in QR's alphanumeric mode, takes the symbol from 53 modules square to 37.
 * That is the difference between a phone reading it and not. The backend builds
 * it in src/utils/verify-url.ts; this is the other half.
 *
 * Written as middleware rather than a `server/routes/v/[id].ts` route because
 * the path arrives uppercased (`/V/A4F6...`) and has to be matched
 * case-insensitively, which a file-based route does not do.
 *
 * Both spellings of the id are accepted - 32 bare hex characters, or the
 * dashed UUID - so a link typed or shortened by hand still lands, and the
 * redirect is temporary rather than permanent so that a future change to the
 * credential URL is not cached in browsers indefinitely.
 */
export default defineEventHandler((event) => {
  const path = (event.path || '').split('?')[0].replace(/\/+$/, '')
  const match = /^\/v\/([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i
    .exec(path)

  if (!match) {
    return
  }

  const uuid = match.slice(1).join('-').toLowerCase()

  return sendRedirect(event, `/credentials/${encodeURIComponent(`urn:uuid:${uuid}`)}`, 302)
})
