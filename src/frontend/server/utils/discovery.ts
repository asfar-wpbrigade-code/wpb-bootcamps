/**
 * Shared origins for the /.well-known discovery documents and /auth.md.
 *
 * These files are read by machines that then go and make requests against
 * whatever they find, so a wrong value here is worse than a missing one. Two
 * different origins are involved, and in production they are NOT the same host:
 *
 *   site - where this Nuxt app is served (e.g. bootcamp.wpbrigade.com). Derived
 *          from the incoming request, so a document always describes the host
 *          it was actually fetched from and cannot drift when the deployment
 *          is renamed or moved.
 *   api  - the Strapi backend, on its own hostname (e.g.
 *          bootcamp-api.wpbrigade.com). Only configuration knows this one.
 *
 * Every URL in these documents was previously hardcoded to
 * `https://wpbrigade.com`, which is neither of those hosts.
 */
import type { H3Event } from 'h3'

/** Origin this request arrived on, honouring the reverse proxy's headers. */
export function siteOrigin(event: H3Event): string {
  const protocol = getRequestProtocol(event, { xForwardedProto: true })
  const host = getRequestHost(event, { xForwardedHost: true })
  return `${protocol}://${host}`
}

/** Origin of the Strapi backend, from NUXT_PUBLIC_API_URL. */
export function apiOrigin(event: H3Event): string {
  const configured = useRuntimeConfig(event).public.apiUrl
  return String(configured || 'http://localhost:1337').replace(/\/+$/, '')
}

/**
 * Swagger UI, which @strapi/plugin-documentation mounts at /documentation on
 * the backend - not /api/documentation, which is what these documents used to
 * advertise and which returns 404.
 */
export function apiDocsUrl(event: H3Event): string {
  return `${apiOrigin(event)}/documentation`
}
