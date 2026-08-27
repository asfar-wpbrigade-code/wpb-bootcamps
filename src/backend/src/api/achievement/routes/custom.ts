/**
 * Custom achievement routes
 *
 * Both were `auth: false` and both returned personal data through
 * `entityService` calls that populate relations directly, bypassing the
 * response sanitisation the core controllers apply:
 *
 * - `:id/credentials` populates each credential's recipient, so it answered
 *   with the name and email of everyone holding the badge. (Also declared in
 *   routes/achievement-credentials.ts - keep the two in step.)
 * - `creator/:creatorId` populates '*', which includes the creator profile
 *   and therefore the issuer's email address.
 *
 * Both are now authenticated. The only caller of either - the issue page's
 * template picker, via composables/useApiClient.ts - already sends a bearer
 * token, so nothing legitimate loses access.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/achievements/:id/credentials',
      handler: 'achievement.findWithCredentials',
    },
    {
      method: 'GET',
      path: '/achievements/creator/:creatorId',
      handler: 'achievement.findByCreator',
    },
  ],
}
