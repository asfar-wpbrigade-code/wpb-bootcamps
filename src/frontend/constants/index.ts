/**
 * The site's own public origin is *not* a constant here.
 *
 * It lives in runtimeConfig (`public.websiteUrl`, set from
 * NUXT_PUBLIC_WEBSITE_URL in nuxt.config.ts) and is read through
 * `useSiteUrl()`. A module constant is inlined into the client bundle at
 * build time, so the container's runtime NUXT_PUBLIC_WEBSITE_URL applied on
 * the server and was ignored in the browser - one page then advertised two
 * different canonical URLs depending on who rendered it.
 *
 * @see composables/useSiteUrl.ts
 * @see docs/known-issues-and-dev-notes.md items 33 and 39
 */

/**
 * Wording lives in locales/en.json under `nav.*`; `name` is only a fallback
 * for the moment before translations resolve.
 */
export const HEADER_NAV_LINKS = [
  { name: 'Home', href: '/', i18nKey: 'home' },
  { name: 'About', href: '/about', i18nKey: 'about' },
  { name: 'My certificates', href: '/dashboard', i18nKey: 'dashboard' },
  { name: 'Issue', href: '/issue', i18nKey: 'issue' },
  { name: 'Verify', href: '/verify', i18nKey: 'verify' },
]
/**
 * Where the footer and the legal pages send questions - including privacy
 * and erasure requests, so it has to be an inbox WPBrigade actually reads.
 */
export const CONTACT_EMAIL = 'bootcamp@wpbrigade.com'
export const CONTACT_MAIL = `mailto:${CONTACT_EMAIL}`
