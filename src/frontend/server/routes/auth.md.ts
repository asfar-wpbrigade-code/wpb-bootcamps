/**
 * GET /auth.md
 *
 * Auth.md — agent registration and authentication instructions.
 * https://workos.com/auth.md
 *
 * Returns text/markdown so agents can parse human-readable + machine-readable
 * registration guidance in one document.
 *
 * URLs are built from the request and from NUXT_PUBLIC_API_URL rather than
 * hardcoded: the API and admin panel are on the backend host, the auth.md and
 * .well-known documents on this one. See server/utils/discovery.ts.
 */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  const api = apiOrigin(event)
  const docs = apiDocsUrl(event)

  return `# Auth Instructions for WPBrigade

## Overview

WPBrigade is a platform for issuing and verifying Open Badges 3.0 and W3C Verifiable Credentials.

The API lives at \`${api}/api\`.
Public endpoints (e.g. \`GET /api/credentials/:id/verify\`) require no authentication.
Write endpoints require a Bearer token.

## Getting an API Token

1. Log in to the WPBrigade admin panel at \`${api}/admin\`
2. Go to **Settings → API Tokens**
3. Click **Create new API Token**
4. Choose a name, expiry, and permission level (\`Full access\` or \`Custom\`)
5. Copy the token — it is shown only once

## Authentication

Pass the token in the \`Authorization\` header:

\`\`\`
Authorization: Bearer YOUR_API_TOKEN
\`\`\`

## Token Endpoint (programmatic login)

Alternatively, obtain a short-lived JWT by posting user credentials:

\`\`\`
POST /api/auth/local
Content-Type: application/json

{ "identifier": "user@example.com", "password": "your-password" }
\`\`\`

Response includes \`jwt\` (use as Bearer token) and \`user\` details.

## Scopes

WPBrigade uses Strapi role-based permissions. Common roles:

| Role | Can do |
|---|---|
| **Issuer** | issue, revoke, renew credentials; manage achievements |
| **Authenticated** | read credentials and achievements |
| **Public** | verify credentials (no token needed) |

## MCP Server

An MCP server covering these operations exists, but it is not published to a
public package registry — contact the operator for access. Its tool inventory
and configuration are described at \`/.well-known/mcp/server-card.json\`.

Once built, point it at this instance:

\`\`\`json
{
  "mcpServers": {
    "wpbrigade": {
      "command": "node",
      "args": ["mcp/dist/index.js"],
      "env": {
        "CERTO_API_URL": "${api}",
        "CERTO_API_TOKEN": "YOUR_API_TOKEN"
      }
    }
  }
}
\`\`\`

## Resources

- OAuth Protected Resource Metadata: \`/.well-known/oauth-protected-resource\`
- OAuth AS Metadata: \`/.well-known/oauth-authorization-server\`
- API Catalog: \`/.well-known/api-catalog\`
- Agent Skills: \`/.well-known/agent-skills/index.json\`
- MCP Server Card: \`/.well-known/mcp/server-card.json\`
- API documentation (Swagger UI): ${docs}
`
})
