/**
 * GET /.well-known/oauth-protected-resource
 *
 * OAuth 2.0 Protected Resource Metadata per RFC 9728.
 * Tells agents which authorization server issues tokens for this API.
 * https://www.rfc-editor.org/rfc/rfc9728
 *
 * `authorization_servers` must match the `issuer` advertised by
 * /.well-known/oauth-authorization-server, which is this site's origin; the
 * resource itself is the Strapi backend on its own host.
 */
export default defineEventHandler(event => ({
  resource: `${apiOrigin(event)}/api`,
  authorization_servers: [
    siteOrigin(event),
  ],
  // Strapi uses bearer tokens - API tokens or user JWTs
  bearer_methods_supported: ['header'],
  scopes_supported: [
    'credential:read',
    'credential:write',
    'credential:revoke',
    'achievement:read',
    'achievement:write',
    'profile:read',
    'profile:export',
  ],
  resource_documentation: apiDocsUrl(event),
  resource_signing_alg_values_supported: ['HS256', 'RS256'],
}))
