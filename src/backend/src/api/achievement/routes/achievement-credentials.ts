/**
 * Lists the credentials issued against one achievement.
 *
 * Authenticated, despite achievements themselves being public: the handler
 * populates each credential's recipient, so this returns the name and email
 * address of everyone who holds the badge. With `auth: false` it answered
 * anonymously - a full recipient list, personal data included, to anyone who
 * knew an achievement id.
 *
 * Note this path is also declared in routes/custom.ts; whichever Strapi
 * registers first wins, so both must agree on auth.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/achievements/:id/credentials',
      handler: 'achievement.findWithCredentials',
    },
  ],
}
