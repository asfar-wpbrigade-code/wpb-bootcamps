/**
 * Finding a credential's achievement and issuer when the relation has gone.
 *
 * It goes, and not rarely. Strapi 5 does not update a published row: it deletes
 * it and inserts a new one with a new id. Every link row pointing at the old id
 * is orphaned by that, so **one save on an achievement or a profile in the
 * admin panel silently breaks every certificate already issued from it** -
 * nothing errors at save time, and the damage only appears when somebody tries
 * to verify. It has happened twice in production: once to the issuer relation
 * when a profile was renamed, once to the achievement relation when a
 * signatory was changed.
 *
 * `documentId` is the identifier that survives. It is stable across
 * republishes, which the numeric row id is not, so issuance records both on the
 * credential and these functions resolve through them whenever the relation
 * itself comes back empty.
 *
 * This is the same treatment `recipientName` already had, for the same reason -
 * see the note on it in api/credential/services/credential.ts. The relation
 * stays the primary path, because it is the one Strapi maintains and populates;
 * the documentId is the fallback that makes the link recoverable rather than
 * lost.
 */

/** What a serialized credential needs from its achievement. */
const ACHIEVEMENT_POPULATE = ['creator', 'image', 'criteria', 'alignment', 'skills']

/** What it needs from a profile. */
const PROFILE_POPULATE = ['image']

/**
 * The credential's achievement: the populated relation, or the published row
 * its `achievementDocumentId` names.
 *
 * @param {object} strapi - The Strapi instance
 * @param {object} credential - A credential with `achievement` populated
 * @returns {Promise<object|null>} The achievement, or null if neither resolves
 */
export async function resolveAchievement(strapi: any, credential: any): Promise<any> {
  if (credential?.achievement) return credential.achievement
  if (!credential?.achievementDocumentId) return null

  return strapi.db.query('api::achievement.achievement').findOne({
    where: {
      documentId: credential.achievementDocumentId,
      publishedAt: { $notNull: true },
    },
    populate: ACHIEVEMENT_POPULATE,
  })
}

/**
 * The credential's issuer, resolved the same way.
 *
 * @param {object} strapi - The Strapi instance
 * @param {object} credential - A credential with `issuer` populated
 * @returns {Promise<object|null>} The issuer profile, or null if neither resolves
 */
export async function resolveIssuer(strapi: any, credential: any): Promise<any> {
  if (credential?.issuer) return credential.issuer
  if (!credential?.issuerDocumentId) return null

  return strapi.db.query('api::profile.profile').findOne({
    where: {
      documentId: credential.issuerDocumentId,
      publishedAt: { $notNull: true },
    },
    populate: PROFILE_POPULATE,
  })
}
