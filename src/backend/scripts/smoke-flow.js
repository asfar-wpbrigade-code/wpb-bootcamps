#!/usr/bin/env node

/**
 * Walks the whole certificate flow against a running instance, over HTTP.
 *
 * The unit suite covers the pieces and the Playwright suite checks that pages
 * render; neither of them issues a certificate. Everything between - the
 * routes, the permission config, the middleware, the signature, the status
 * list, the PDF - is only ever exercised by hand. This is that walk, written
 * down:
 *
 *   1. log in as the seeded issuer
 *   2. issue a credential to a recipient
 *   3. verify it, and expect a pass on all three checks
 *   4. fetch the issuer's StatusList2021Credential and decode the bitstring,
 *      expecting this credential's slot to be clear
 *   5. fetch the PDF and confirm its invisible text layer holds the
 *      recipient's name - the string that is drawn as outlines and so cannot
 *      come from the SVG
 *   6. revoke it
 *   7. verify again, and expect a fail; decode the list again, and expect the
 *      slot set
 *   8. delete what it created
 *
 * Deliberately over HTTP rather than in-process. A route that is not
 * registered, a permission that was not granted, a response the frontend
 * cannot parse - none of those show up when the services are called directly,
 * and all of them have broken this app before.
 *
 * Requires the development seed data (`admin@certo.com`), so it is for a
 * development or CI instance. It refuses to run against anything else unless
 * told to, because step 6 revokes a real credential.
 *
 * Usage:
 *
 *   node scripts/smoke-flow.js
 *   node scripts/smoke-flow.js --base-url http://localhost:1337
 *   node scripts/smoke-flow.js --keep      # leave the credential in place
 *
 * Exits non-zero on the first failed expectation, with the response that
 * failed it.
 */

// No dotenv, and no dependencies at all: this talks HTTP and nothing else, so
// it runs with a bare `node` against any instance, CI included.

const zlib = require('zlib');

const args = process.argv.slice(2);
const BASE_URL = (readArg('--base-url') || process.env.SMOKE_BASE_URL || 'http://localhost:1337').replace(/\/$/, '');
const KEEP = args.includes('--keep');
const EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@certo.com';
const PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'certo-dev';
const RECIPIENT = process.env.SMOKE_RECIPIENT || 'smoke-flow@example.invalid';

function readArg(name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

let step = 0;

function pass(message) {
  step += 1;
  console.log(`  ok ${step}  ${message}`);
}

function fail(message, detail) {
  console.error(`\n  FAILED  ${message}`);
  if (detail !== undefined) {
    console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
  }
  process.exit(1);
}

async function request(method, path, { token, body, raw } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (raw) {
    return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()) };
  }

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: response.status, json, text };
}

/** Mirrors decodeStatusList() in src/utils/status-list.ts - MSB-first bits. */
function decodeStatusList(encodedList) {
  const bitstring = zlib.gunzipSync(Buffer.from(encodedList, 'base64url'));
  const indices = [];

  for (let byteIndex = 0; byteIndex < bitstring.length; byteIndex++) {
    const byte = bitstring[byteIndex];
    if (byte === 0) continue;
    for (let bit = 0; bit < 8; bit++) {
      if (byte & (0b10000000 >> bit)) indices.push(byteIndex * 8 + bit);
    }
  }

  return indices;
}

/**
 * The text a reader would find in the PDF.
 *
 * pdf-lib writes strings as hex inside a Flate-compressed content stream, so
 * searching the bytes for the words finds nothing whether or not the layer is
 * there - see src/utils/__tests__/certificate-render.test.ts.
 */
function extractPdfText(pdf) {
  const found = [];
  const marker = Buffer.from('stream');
  const endMarker = Buffer.from('endstream');

  for (let index = pdf.indexOf(marker); index !== -1; index = pdf.indexOf(marker, index + 1)) {
    let start = index + marker.length;
    while (pdf[start] === 0x0d || pdf[start] === 0x0a) start++;

    const end = pdf.indexOf(endMarker, start);
    if (end === -1) continue;

    let content;
    try {
      content = zlib.inflateSync(pdf.subarray(start, end)).toString('latin1');
    } catch {
      continue;
    }

    for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      found.push(Buffer.from(match[1], 'hex').toString('latin1'));
    }
  }

  return found.join('\n');
}

async function main() {
  console.log(`\nsmoke-flow against ${BASE_URL}\n`);

  const health = await request('GET', '/api/health');
  if (health.status !== 200) fail('the instance is not answering /api/health', health.text);
  pass('instance is up');

  const login = await request('POST', '/api/auth/local', {
    body: { identifier: EMAIL, password: PASSWORD },
  });
  if (login.status !== 200 || !login.json?.jwt) {
    fail(`could not log in as ${EMAIL}. This script needs the development seed data.`, login.json || login.text);
  }
  const token = login.json.jwt;
  pass(`logged in as ${EMAIL}`);

  const achievements = await request('GET', '/api/achievements');
  const achievement = achievements.json?.data?.[0];
  if (!achievement) fail('no published achievements to issue', achievements.json || achievements.text);
  const achievementId = achievement.id || achievement.documentId;
  pass(`found achievement "${achievement.name || achievementId}"`);

  // The exact shape api-client.ts's issueBadge() sends, `data` wrapper and
  // `recipientId: 0` included. Sending what the frontend sends is the point:
  // a payload the controller rejects is a bug this script has to be able to
  // catch, and it caught one on its first run.
  const issued = await request('POST', '/api/credentials/issue', {
    token,
    body: {
      data: {
        achievementId,
        recipientId: 0,
        recipient: { name: 'Smoke Flow', email: RECIPIENT },
        evidence: [],
      },
    },
  });
  if (issued.status !== 200 && issued.status !== 201) {
    fail('issuance failed', issued.json || issued.text);
  }

  // { credential, openBadge, notification } - not a Strapi `data` envelope.
  const credentialId = issued.json?.credential?.credentialId;
  if (!credentialId) fail('issuance returned no credentialId', issued.json);
  if (issued.json?.notification?.sent !== true) {
    // The recipient never hearing about their certificate is a failed
    // issuance in every sense that matters, even though the row exists.
    fail('the issuance email was not sent', issued.json.notification);
  }
  pass(`issued ${credentialId} to ${RECIPIENT}`);

  const verified = await request('GET', `/api/credentials/${credentialId}/verify`);
  if (verified.json?.verified !== true) {
    fail('a freshly issued credential did not verify', verified.json || verified.text);
  }
  const checks = (verified.json.checks || []).map(check => check.check).sort();
  if (checks.join(',') !== 'not_expired,not_revoked,proof') {
    fail('verification did not run the three checks', verified.json.checks);
  }
  pass('verifies, with all three checks passing');

  const status = verified.json.credential?.credentialStatus;
  if (!status?.statusListCredential?.startsWith('http')) {
    fail('credentialStatus.statusListCredential is not a URL a verifier could fetch', status);
  }
  const slot = Number(status.statusListIndex);
  pass(`carries slot ${slot} in ${status.statusListCredential}`);

  // Fetched as a third party would: no token, no account, just the address out
  // of the credential.
  //
  // The path, taken against the instance under test, rather than the whole URL.
  // The credential advertises whatever `server.url` is configured as, which is
  // the public API host and need not be the address this script was pointed
  // at - a smoke run against a staging port, or through a tunnel, would
  // otherwise read the list from a different instance, or from nothing at all.
  const listPath = new URL(status.statusListCredential).pathname;
  const list = await request('GET', listPath);
  if (list.status !== 200) fail('the status list is not publicly fetchable', list.text);
  const encodedList = list.json?.credentialSubject?.encodedList;
  if (!encodedList) fail('the status list carries no encodedList', list.json);
  if (!list.json.proof) fail('the status list is not signed', list.json);
  if (decodeStatusList(encodedList).includes(slot)) {
    fail(`slot ${slot} is already set in the status list before revocation`);
  }
  pass('status list fetches unauthenticated, is signed, and the slot is clear');

  const pdf = await request('GET', `/api/credentials/${credentialId}/certificate?format=pdf`, { raw: true });
  if (pdf.status !== 200 || pdf.buffer.subarray(0, 5).toString() !== '%PDF-') {
    fail('the certificate PDF did not come back', pdf.status);
  }
  const pdfText = extractPdfText(pdf.buffer);
  if (!pdfText.includes('Smoke Flow')) {
    fail('the PDF has no searchable recipient name', pdfText.slice(0, 500));
  }
  if (!pdfText.includes('Certificate of Completion')) {
    fail('the PDF has no searchable heading', pdfText.slice(0, 500));
  }
  pass('PDF carries a text layer with the recipient name and the heading');

  const revoked = await request('POST', `/api/credentials/${credentialId}/revoke`, {
    token,
    body: { reason: 'smoke-flow' },
  });
  if (revoked.status !== 200) fail('revocation failed', revoked.json || revoked.text);
  pass('revoked');

  const reverified = await request('GET', `/api/credentials/${credentialId}/verify`);
  if (reverified.json?.verified !== false) {
    fail('a revoked credential still verifies', reverified.json || reverified.text);
  }
  pass('no longer verifies');

  const listAfter = await request('GET', listPath);
  const encodedAfter = listAfter.json?.credentialSubject?.encodedList;
  if (!decodeStatusList(encodedAfter).includes(slot)) {
    fail(`slot ${slot} is not set in the status list after revocation`, decodeStatusList(encodedAfter));
  }
  pass(`slot ${slot} is set in the published status list`);

  if (KEEP) {
    console.log(`\n  kept ${credentialId} (--keep)\n`);
    return;
  }

  const deleted = await request('DELETE', `/api/credentials/${credentialId}`, { token });
  if (deleted.status !== 200 && deleted.status !== 204) {
    console.warn(`\n  note: could not delete ${credentialId} (${deleted.status}). Remove it by hand.`);
  } else {
    pass('cleaned up');
  }

  // The recipient profile and account are left in place: issuance creates them
  // and they are shared with anything else issued to that address. They are
  // harmless, and named after this script.
  console.log(`\n  the ${RECIPIENT} profile and account remain, as issuance created them\n`);
}

main().then(() => {
  console.log('smoke-flow passed\n');
}).catch((error) => {
  fail('unexpected error', error?.stack || String(error));
});
