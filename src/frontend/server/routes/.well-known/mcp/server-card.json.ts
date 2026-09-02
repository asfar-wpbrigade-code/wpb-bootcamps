/**
 * GET /.well-known/mcp/server-card.json
 *
 * MCP Server Card per SEP-1649.
 * https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127
 *
 * Advertises the WPBrigade MCP server, its transport, and its capabilities so
 * agent frameworks can auto-configure without reading a README.
 *
 * The transport previously read `npx -y @certo/mcp`, an npm package that does
 * not exist (404 from the registry). The server is built from this project's
 * `mcp/` workspace instead, so the command reflects that and `distribution`
 * says where it comes from. See also /.well-known/mcp.json.
 */
export default defineEventHandler(event => ({
  serverInfo: {
    name: 'wpbrigade',
    version: '0.1.0',
    description: 'Platform for issuing and verifying Open Badges 3.0 / Verifiable Credentials',
  },
  transport: {
    // stdio server, built from source - see distribution below
    type: 'stdio',
    command: 'node',
    args: ['mcp/dist/index.js'],
    // configuration via env vars
    env: {
      CERTO_API_URL: apiOrigin(event),
      CERTO_API_TOKEN: '(required for write operations)',
    },
  },
  distribution: {
    status: 'not-published',
    detail: 'Built from the WPBrigade platform repository (mcp/ workspace, '
      + '`npm install && npm run build`). Not on a public package registry.',
  },
  capabilities: {
    tools: {
      list: [
        { name: 'verify_credential', auth: false },
        { name: 'list_achievements', auth: false },
        { name: 'get_credential', auth: false },
        { name: 'list_credentials', auth: true },
        { name: 'issue_credential', auth: true },
        { name: 'revoke_credential', auth: true },
        { name: 'renew_credential', auth: true },
        { name: 'run_expiration_check', auth: true },
        { name: 'export_profile_data', auth: true },
      ],
    },
  },
  links: {
    agentSkills: `${siteOrigin(event)}/.well-known/agent-skills/index.json`,
  },
}))
