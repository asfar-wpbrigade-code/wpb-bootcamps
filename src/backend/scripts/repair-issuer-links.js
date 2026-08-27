#!/usr/bin/env node

/**
 * Repairs credentials whose issuer relation was deleted underneath them.
 *
 * Issuance used to update the recipient's profile with `publishedAt` set
 * (see the note in api/credential/services/credential.ts). A Strapi 5
 * republish deletes the published row and inserts a new one, so every link
 * row pointing at the old row went with it - including the issuer link on
 * credentials issued earlier, whenever the profile being republished was the
 * issuer's own. Those credentials are published and correctly signed, but
 * `GET /api/credentials/:id/verify` answers "Credential is missing an
 * associated issuer", so nobody can verify them.
 *
 * The issuer is recoverable without guessing: a credential still points at
 * its achievement, and an achievement points at the profile that created it.
 * That creator IS the issuer, by definition - so the link is rebuilt from the
 * achievement rather than from the dead row id recorded in the proof.
 *
 * Signatures are unaffected. The JWS was made over the payload as it stood at
 * issuance and is still valid; restoring the relation just lets verification
 * find the issuer's public key again.
 *
 * Usage, from the repo root:
 *
 *   docker exec certo_backend node scripts/repair-issuer-links.js
 *   docker exec certo_backend node scripts/repair-issuer-links.js --apply
 *
 * The first form changes nothing and prints what it would do. Both are safe
 * to run repeatedly - only missing links are inserted.
 */

require('dotenv').config();

const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');

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
 * Every credential row missing an issuer link, together with the profile row
 * that should be there.
 *
 * Draft and published rows are both included: a healthy credential has a link
 * from each, and both point at the *published* profile row (which is how
 * Strapi stores it - see any credential that still has its link).
 */
const FIND_BROKEN = `
  SELECT
    c.id                       AS credential_row,
    c.credential_id            AS credential_uuid,
    c.published_at IS NOT NULL AS is_published,
    creator.profile_id         AS issuer_row,
    p.email                    AS issuer_email
  FROM credentials c
  LEFT JOIN credentials_issuer_lnk issuer ON issuer.credential_id = c.id
  LEFT JOIN credentials_achievement_lnk ach ON ach.credential_id = c.id
  LEFT JOIN achievements_creator_lnk creator ON creator.achievement_id = ach.achievement_id
  LEFT JOIN profiles p ON p.id = creator.profile_id
  WHERE issuer.credential_id IS NULL
  ORDER BY c.id
`;

async function main() {
  const client = new Client(connectionConfig());
  await client.connect();

  try {
    const { rows } = await client.query(FIND_BROKEN);

    if (rows.length === 0) {
      console.log('[repair] Every credential already has an issuer link. Nothing to do.');
      return;
    }

    const repairable = rows.filter(row => row.issuer_row !== null);
    const unresolved = rows.filter(row => row.issuer_row === null);

    console.log(`[repair] ${rows.length} credential row(s) have no issuer link.`);

    const byIssuer = new Map();
    for (const row of repairable) {
      const key = `${row.issuer_row} (${row.issuer_email || 'no email'})`;
      byIssuer.set(key, (byIssuer.get(key) || 0) + 1);
    }
    for (const [issuer, count] of byIssuer) {
      console.log(`[repair]   ${count} to be linked to profile ${issuer}`);
    }

    if (unresolved.length > 0) {
      // Either the achievement link is gone too, or the achievement has no
      // creator. Neither is recoverable from the database alone - those
      // credentials have to be re-issued.
      console.log(`[repair] ${unresolved.length} cannot be resolved (no achievement or no creator) and need re-issuing:`);
      for (const row of unresolved) {
        console.log(`[repair]   row ${row.credential_row}  ${row.credential_uuid}`);
      }
    }

    if (!APPLY) {
      console.log('[repair] Dry run - nothing was changed. Re-run with --apply to insert the links.');
      return;
    }

    await client.query('BEGIN');

    let inserted = 0;
    for (const row of repairable) {
      // ON CONFLICT is not usable here (no unique constraint to target), so
      // the guard is the WHERE NOT EXISTS - which also makes re-runs a no-op.
      const result = await client.query(
        `INSERT INTO credentials_issuer_lnk (credential_id, profile_id)
         SELECT $1, $2
         WHERE NOT EXISTS (
           SELECT 1 FROM credentials_issuer_lnk WHERE credential_id = $1
         )`,
        [row.credential_row, row.issuer_row]
      );
      inserted += result.rowCount;
    }

    await client.query('COMMIT');

    console.log(`[repair] Linked ${inserted} credential row(s).`);
    console.log('[repair] Check one with: curl -s http://localhost:1337/api/credentials/<urn:uuid:...>/verify');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The transaction may never have opened; the original error is what matters.
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[repair] Failed:', error.message);
  process.exitCode = 1;
});
