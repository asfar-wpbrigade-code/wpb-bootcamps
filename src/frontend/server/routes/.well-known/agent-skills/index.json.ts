/**
 * GET /.well-known/agent-skills/index.json
 *
 * Agent Skills Discovery index per the Agent Skills Discovery RFC v0.2.0.
 * Lists the machine-callable skills (tools) exposed to AI agents.
 * https://github.com/cloudflare/agent-skills-discovery-rfc
 *
 * The SKILL.md files themselves are static, served from
 * public/.well-known/agent-skills/, so their URLs are on this site's origin
 * rather than the backend's.
 */
const SKILLS = [
  {
    name: 'verify-credential',
    description: 'Verify an Open Badges 3.0 / Verifiable Credential by URN or ID',
    digest: 'sha256:3de64c9b5c14104420c6d0b35af4d385498037d2df0feeb02c9cc9486bdd87a9',
  },
  {
    name: 'issue-credential',
    description: 'Issue an Open Badges 3.0 credential to a recipient by email',
    digest: 'sha256:fe0e82e8c487815b9998688ff0250ab98d24403bc75a8a227df08c47c8cb2fcd',
  },
  {
    name: 'list-achievements',
    description: 'List available badge definitions (achievements) in a WPBrigade instance',
    digest: 'sha256:33d171915920dbf62044efb185ab45b21ea07dd95ded121cf25c517b6ab4a634',
  },
  {
    name: 'revoke-credential',
    description: 'Revoke an issued credential, rendering it invalid for future verification',
    digest: 'sha256:73900c547b29a1007e94622b485abab158d4b29c5fff5b90c38e9475456d5337',
  },
]

export default defineEventHandler((event) => {
  const site = siteOrigin(event)

  return {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: SKILLS.map(skill => ({
      name: skill.name,
      type: 'skill-md',
      description: skill.description,
      url: `${site}/.well-known/agent-skills/${skill.name}/SKILL.md`,
      digest: skill.digest,
    })),
  }
})
