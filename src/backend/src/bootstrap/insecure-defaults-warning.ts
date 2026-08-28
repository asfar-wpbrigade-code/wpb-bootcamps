/**
 * Warns, on every boot, when the instance is running on values that are
 * published in this repository and therefore secret from nobody.
 *
 * docker-compose.yml carries development defaults so a fresh clone starts
 * without configuration. That is a good default for a laptop and a bad one for
 * a deployment, and the failure is silent: everything works, so nothing
 * prompts anyone to look.
 *
 * ENCRYPTION_KEY is the one that matters most. It encrypts every issuer's
 * private signing key at rest, so running on the published default means
 * anyone with a copy of the database and a copy of this repo can decrypt them
 * and sign certificates as you. Note that changing it later makes existing
 * keys unreadable - so this wants fixing before the first real certificate is
 * issued, not after.
 *
 * Deliberately only warns. Refusing to boot would take a running service down
 * over a misconfiguration it has already survived; the fix belongs to an
 * operator reading the logs.
 */

/** The values docker-compose.yml ships for local development. */
const PUBLISHED_DEFAULTS: Array<{ name: string, value: string, consequence: string }> = [
  {
    name: 'ENCRYPTION_KEY',
    value: 'oM/e09YZzP6Pz9gNkS5Y2w==',
    consequence: 'issuer signing keys in the database can be decrypted by anyone holding this repository',
  },
  {
    name: 'JWT_SECRET',
    value: 'your-jwt-secret',
    consequence: 'anyone can mint a valid login token for any user',
  },
  {
    name: 'ADMIN_JWT_SECRET',
    value: 'your-admin-jwt-secret',
    consequence: 'anyone can mint a valid admin panel session',
  },
  {
    name: 'APP_KEYS',
    value: 'your-app-keys',
    consequence: 'session cookies can be forged',
  },
  {
    name: 'API_TOKEN_SALT',
    value: 'your-api-token-salt',
    consequence: 'API tokens are predictable',
  },
]

export function warnOnInsecureDefaults(strapi: any): void {
  const offenders = PUBLISHED_DEFAULTS.filter(entry => process.env[entry.name] === entry.value)

  if (offenders.length === 0) return

  strapi.log.warn('='.repeat(72))
  strapi.log.warn(`[Security] ${offenders.length} secret(s) are still set to the development defaults published in this repository:`)

  for (const entry of offenders) {
    strapi.log.warn(`[Security]   ${entry.name} - ${entry.consequence}`)
  }

  strapi.log.warn('[Security] Generate your own and set them in the environment before issuing anything real.')

  if (offenders.some(entry => entry.name === 'ENCRYPTION_KEY')) {
    strapi.log.warn('[Security] ENCRYPTION_KEY cannot be rotated once certificates exist - existing signing keys would become undecryptable. Change it now or not at all.')
  }

  strapi.log.warn('='.repeat(72))
}
