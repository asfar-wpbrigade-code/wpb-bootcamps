#!/usr/bin/env node

/**
 * Lists login accounts that have no published profile.
 *
 * Issuance creates the account and the profile together
 * (api/credential/services/credential.ts's `issue()` calls
 * `findOrCreateRecipientProfile()` then `findOrCreateUser()`), so a healthy
 * account always has one. Self-registration created only the account, which
 * left a login that works and a dashboard, profile page and certificate list
 * that are all empty - `profile.me` resolves the profile by matching
 * `ctx.state.user.email` against a *published* profile row and 404s when there
 * is none. That path is gone (`allow_register: false`, item 42 in
 * docs/known-issues-and-dev-notes.md), but accounts made through it while it
 * was open are still there, and nothing about them looks wrong from the login
 * side.
 *
 * This reports; it does not change anything. Two reasons:
 *
 *   - Which remediation is right is a judgement call per account. Someone who
 *     should have access needs a profile; a stranger who found the page needs
 *     the account removed. The report prints what each account holds so that
 *     call can be made quickly.
 *   - Creating a profile means a document_id plus a draft row and a published
 *     row, and getting Strapi 5's draft/publish pairing subtly wrong by hand
 *     is worse than the empty dashboard. The admin panel does it correctly.
 *
 * A draft-only profile is reported too, and is its own trap: the row exists,
 * the admin panel shows it, and `profile.me` still 404s because it filters on
 * `status: 'published'`. Publishing it is the whole fix.
 *
 * Usage, from the repo root:
 *
 *   docker exec certo_backend node scripts/find-profileless-accounts.js
 *
 * Exits 0 whether or not it finds any, so it is safe in a cron or a check
 * script. Read-only: it opens no transaction and issues no writes.
 */

require('dotenv').config();

const { Client } = require('pg');

function connectionConfig() {
  if ((process.env.DATABASE_CLIENT || 'sqlite') !== 'postgres') {
    throw new Error(
      `This script only supports postgres; DATABASE_CLIENT is "${process.env.DATABASE_CLIENT || 'sqlite'}"`
    );
  }

  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  return {
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME || 'strapi',
    user: process.env.DATABASE_USERNAME || 'strapi',
    password: process.env.DATABASE_PASSWORD || 'strapi',
  };
}

/**
 * Accounts with no published profile at the same email address.
 *
 * The join is on email because that is what `profile.me`, `profile.updateMe`
 * and the export/erasure handlers all resolve on - so email is what decides
 * whether an account can see anything, regardless of what
 * `profiles_owner_lnk` says.
 *
 * `draft_profiles` separates "no profile at all" from "a profile that was
 * never published", because the fix differs: create one, or press Publish.
 * Credentials are counted through the recipient link on the profile rows at
 * that address, so an account that was issued something and then had its
 * profile unpublished stands out from one that was never a recipient.
 */
const FIND_PROFILELESS = `
  SELECT
    u.id                        AS user_row,
    u.email,
    u.username,
    u.created_at,
    u.blocked,
    u.confirmed,
    r.name                      AS role_name,
    COALESCE(d.draft_count, 0)  AS draft_profiles,
    COALESCE(c.cred_count, 0)   AS credentials
  FROM up_users u
  LEFT JOIN up_users_role_lnk url ON url.user_id = u.id
  LEFT JOIN up_roles r ON r.id = url.role_id
  LEFT JOIN (
    SELECT lower(email) AS email, count(*) AS draft_count
    FROM profiles
    WHERE published_at IS NULL AND email IS NOT NULL
    GROUP BY lower(email)
  ) d ON d.email = lower(u.email)
  LEFT JOIN (
    SELECT lower(p.email) AS email, count(DISTINCT cr.credential_id) AS cred_count
    FROM profiles p
    JOIN credentials_recipient_lnk cr ON cr.profile_id = p.id
    WHERE p.email IS NOT NULL
    GROUP BY lower(p.email)
  ) c ON c.email = lower(u.email)
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE lower(p.email) = lower(u.email)
      AND p.published_at IS NOT NULL
  )
  ORDER BY u.created_at
`;

async function main() {
  const client = new Client(connectionConfig());
  await client.connect();

  try {
    const { rows } = await client.query(FIND_PROFILELESS);

    const total = await client.query('SELECT count(*)::int AS n FROM up_users');
    console.log(`[accounts] ${total.rows[0].n} login account(s) in total.`);

    if (rows.length === 0) {
      console.log('[accounts] Every one of them has a published profile. Nothing to do.');
      return;
    }

    console.log(`[accounts] ${rows.length} have no published profile and will find every page empty:`);
    console.log('');

    for (const row of rows) {
      const created = new Date(row.created_at).toISOString().slice(0, 10);
      const flags = [
        row.blocked ? 'blocked' : null,
        row.confirmed ? null : 'unconfirmed',
      ].filter(Boolean);

      console.log(`  ${row.email}`);
      console.log(`    user row ${row.user_row}, username "${row.username}", role ${row.role_name || 'none'}, created ${created}${flags.length ? `, ${flags.join(', ')}` : ''}`);

      if (Number(row.draft_profiles) > 0) {
        console.log(`    has ${row.draft_profiles} unpublished profile row(s) - Content Manager -> Profile -> Publish is the whole fix`);
      }
      else {
        console.log('    no profile row at all - Content Manager -> Profile -> create one with this email, then Publish');
      }

      if (Number(row.credentials) > 0) {
        console.log(`    holds ${row.credentials} credential(s), so this is a real recipient: fix the profile, do not remove the account`);
      }
      else {
        console.log('    holds no credentials - most likely a self-registration leftover, and removing the account is reasonable');
      }
      console.log('');
    }

    console.log('[accounts] Both remediations are in the Strapi admin panel; see');
    console.log('[accounts] README.md#making-yourself-an-issuer for what a profile needs.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[accounts] Failed:', error.message);
  process.exitCode = 1;
});
