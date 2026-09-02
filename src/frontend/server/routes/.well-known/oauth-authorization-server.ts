/**
 * GET /.well-known/oauth-authorization-server
 *
 * OAuth 2.0 Authorization Server Metadata per RFC 8414.
 * Strapi provides JWT-based authentication; this describes the token endpoint
 * so agents can programmatically discover how to obtain API tokens.
 * https://www.rfc-editor.org/rfc/rfc8414
 *
 * Endpoints split across two hosts: the token and admin endpoints belong to
 * the Strapi backend, while the issuer identity and auth.md live on this site.
 * See server/utils/discovery.ts.
 */
export default defineEventHandler((event) => {
  const site = siteOrigin(event)
  const api = apiOrigin(event)

  return {
    issuer: site,
    authorization_endpoint: `${api}/api/connect/authorize`,
    token_endpoint: `${api}/api/auth/local`,
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    grant_types_supported: ['password', 'authorization_code'],
    response_types_supported: ['token'],
    // Admin panel token creation
    token_management_endpoint: `${api}/admin/settings/api-tokens`,
    // Agent registration via auth.md
    registration_endpoint: `${site}/auth.md`,
    scopes_supported: [
      'credential:read',
      'credential:write',
      'credential:revoke',
      'achievement:read',
      'achievement:write',
      'profile:read',
      'profile:export',
    ],
    service_documentation: apiDocsUrl(event),
    // Agent-specific extension (auth.md spec)
    agent_auth: {
      register_uri: `${site}/auth.md`,
      supported_identity_types: ['api-key'],
      credential_types: ['bearer'],
    },
  }
})
