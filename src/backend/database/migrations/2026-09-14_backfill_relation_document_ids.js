'use strict';

/**
 * Records each existing credential's achievement and issuer `documentId`
 * alongside the relations that already point at them.
 *
 * Issuance writes both from now on. This is for everything issued before that,
 * and it is worth running promptly: it can only recover a link that is still
 * there. A credential whose achievement or issuer relation has already been
 * orphaned by a republish has nothing left to read the documentId from, and
 * this migration leaves it alone rather than guessing.
 *
 * Why the documentId matters: Strapi 5 does not update a published row, it
 * deletes it and inserts a new one, so every link row pointing at the old id is
 * orphaned - one save on an achievement or a profile in the admin panel
 * silently stops every certificate issued from it verifying. documentId is
 * stable across republishes. See src/utils/credential-relations.ts.
 *
 * Idempotent: only rows where the column is still null are written, so
 * re-running changes nothing and a credential whose documentId was set at
 * issuance is never touched.
 */

async function backfill(knex, { column, linkTable, linkColumn, targetTable, label }) {
  const hasLink = await knex.schema.hasTable(linkTable);
  if (!hasLink) {
    console.log(`credentials: ${linkTable} does not exist, skipping ${label}`);
    return;
  }

  // The join runs through the link table, which is the only thing connecting a
  // credential to its target - and precisely what a republish destroys.
  const updated = await knex.raw(
    `UPDATE credentials AS c
        SET ${column} = t.document_id
       FROM ${linkTable} AS l
       JOIN ${targetTable} AS t ON t.id = l.${linkColumn}
      WHERE l.credential_id = c.id
        AND c.${column} IS NULL
        AND t.document_id IS NOT NULL`,
  );

  console.log(`credentials: ${label} backfilled on ${updated.rowCount ?? 0} row(s)`);
}

module.exports = {
  async up(knex) {
    const hasCredentials = await knex.schema.hasTable('credentials');
    if (!hasCredentials) {
      console.log('credentials table does not exist yet, skipping (schema sync will create it)');
      return;
    }

    // The columns are added here rather than waited for. Strapi runs these
    // migrations *before* syncing the content-type schema, so on the upgrade
    // boot - the only one where there is anything to backfill - the columns
    // from credential/schema.json do not exist yet. Waiting for them meant
    // this skipped, recorded itself as applied, and never ran again: the
    // migration "succeeded" and not one credential was backfilled.
    //
    // Creating them is what 2026-08-06_add_profile_owner.js does, for the
    // same reason. The schema sync that follows sees them already present and
    // leaves them alone.
    const columns = ['achievement_document_id', 'issuer_document_id'];

    for (const column of columns) {
      if (await knex.schema.hasColumn('credentials', column)) continue;

      await knex.schema.table('credentials', (table) => {
        table.string(column);
      });
      console.log(`credentials: added ${column}`);
    }

    await backfill(knex, {
      column: 'achievement_document_id',
      linkTable: 'credentials_achievement_lnk',
      linkColumn: 'achievement_id',
      targetTable: 'achievements',
      label: 'achievementDocumentId',
    });

    await backfill(knex, {
      column: 'issuer_document_id',
      linkTable: 'credentials_issuer_lnk',
      linkColumn: 'profile_id',
      targetTable: 'profiles',
      label: 'issuerDocumentId',
    });

    const orphaned = await knex('credentials')
      .whereNull('achievement_document_id')
      .orWhereNull('issuer_document_id')
      .count({ n: '*' });

    const remaining = Number(orphaned[0]?.n ?? 0);
    if (remaining > 0) {
      // Not a failure: these are the credentials whose links had already gone
      // before this ran. They cannot be recovered from the database alone.
      console.log(
        `credentials: ${remaining} row(s) still have no documentId - their link `
        + 'was already orphaned, and they need relinking by hand or re-issuing',
      );
    }
  },

  async down(knex) {
    const hasCredentials = await knex.schema.hasTable('credentials');
    if (!hasCredentials) return;

    const hasAchievementColumn = await knex.schema.hasColumn('credentials', 'achievement_document_id');
    if (!hasAchievementColumn) return;

    // Clears what was written without touching the relations themselves, so a
    // rollback loses only the fallback and not the primary path.
    await knex('credentials').update({
      achievement_document_id: null,
      issuer_document_id: null,
    });
  },
};
