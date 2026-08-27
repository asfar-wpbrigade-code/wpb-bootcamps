/**
 * Custom route for creating achievements with proper tag handling.
 *
 * Duplicates what `POST /api/achievements` does (both end up in
 * `super.create`); kept because it may have external callers, but no longer
 * public - it used to carry `auth: false`, which made it a second anonymous
 * way to create badge templates alongside the core route. See
 * routes/achievement.ts for the full note.
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/achievements/create',
      handler: 'achievement.createAchievement',
    },
  ],
}
