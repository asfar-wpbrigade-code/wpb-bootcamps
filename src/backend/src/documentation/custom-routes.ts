/**
 * OpenAPI for the routes @strapi/plugin-documentation cannot see.
 *
 * The generator only reads the router file named after the content type, so
 * anything defined in a sibling routes file is invisible to it. That left the
 * `me` family on profile, the issuer keys, and the endorsement and achievement
 * extras undocumented - and, because api/credential/routes/credential.ts is
 * deliberately `{ routes: [] }`, every single credential endpoint, including
 * the public verification and certificate ones this platform exists to serve.
 *
 * Registered without `excludeFromGeneration`, so these paths merge on top of
 * the generated ones rather than replacing them. `info` is deliberately
 * absent: the plugin skips any override whose info.version does not match the
 * version being generated.
 */

/** Reuses the Error schema and bearerAuth scheme the generator already emits. */
const ERROR = { $ref: '#/components/schemas/Error' }

function failure(description: string) {
  return { description, content: { 'application/json': { schema: ERROR } } }
}

function success(description: string, schema: any = { type: 'object' }) {
  return { description, content: { 'application/json': { schema } } }
}

const BAD_REQUEST = failure('Bad request')
const UNAUTHORIZED = failure('Authentication required')
const NOT_FOUND = failure('Not found')

const AUTHENTICATED = [{ bearerAuth: [] }]

const JSON_BODY = {
  required: true,
  content: { 'application/json': { schema: { type: 'object' } } },
}

/** Every credential endpoint accepts any of the three identifiers we hand out. */
const CREDENTIAL_ID = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'The `urn:uuid:` credentialId, the Strapi documentId, or the numeric row id.',
  schema: { type: 'string' },
}

function pathId(name: string, description: string) {
  return { name, in: 'path', required: true, description, schema: { type: 'string' } }
}

const PROFILE_ID = pathId('id', 'Profile id.')

export const customRouteDocumentation = {
  tags: [
    { name: 'Credential', description: 'Issuing, verifying, revoking and rendering credentials.' },
    { name: 'Profile', description: 'Issuer and recipient profiles, including the caller own.' },
  ],

  paths: {
    // ---- Credential: the collection itself ---------------------------------
    // Normally the generator would emit these from the content type, but
    // api/credential/routes/credential.ts is an empty router, so it emits
    // nothing at all for credentials and even the plain CRUD needs writing out.
    '/credentials': {
      get: {
        tags: ['Credential'],
        summary: 'List credentials',
        description: 'Public: verification pages and shared certificates rely on being '
          + 'readable without an account.',
        responses: { 200: success('Credential list'), 400: BAD_REQUEST },
      },
      post: {
        tags: ['Credential'],
        summary: 'Create a credential',
        description: 'Prefer /credentials/issue, which also signs the credential.',
        security: AUTHENTICATED,
        requestBody: JSON_BODY,
        responses: { 200: success('The credential'), 400: BAD_REQUEST, 401: UNAUTHORIZED },
      },
    },

    '/credentials/{id}': {
      get: {
        tags: ['Credential'],
        summary: 'Fetch one credential as Open Badges 3.0 JSON',
        description: 'Public.',
        parameters: [CREDENTIAL_ID],
        responses: { 200: success('Open Badges 3.0 document'), 404: NOT_FOUND },
      },
      put: {
        tags: ['Credential'],
        summary: 'Update a credential',
        security: AUTHENTICATED,
        parameters: [CREDENTIAL_ID],
        requestBody: JSON_BODY,
        responses: {
          200: success('The updated credential'),
          400: BAD_REQUEST,
          401: UNAUTHORIZED,
          404: NOT_FOUND,
        },
      },
      delete: {
        tags: ['Credential'],
        summary: 'Delete a credential',
        description: 'Removes the record outright. To make an issued certificate stop '
          + 'verifying while keeping its history, revoke it instead.',
        security: AUTHENTICATED,
        parameters: [CREDENTIAL_ID],
        responses: { 200: success('Deleted'), 401: UNAUTHORIZED, 404: NOT_FOUND },
      },
    },

    // ---- Credential: public ------------------------------------------------
    '/credentials/{id}/verify': {
      get: {
        tags: ['Credential'],
        summary: 'Verify a credential',
        description: 'Checks the cryptographic proof, the expiry date and the revocation list. '
          + 'Public - no authentication, so anyone holding a certificate can confirm it.',
        parameters: [CREDENTIAL_ID],
        responses: { 200: success('Verification result'), 404: NOT_FOUND },
      },
    },

    '/credentials/validate': {
      post: {
        tags: ['Credential'],
        summary: 'Validate a credential supplied in the request',
        description: 'Verifies a credential document that was submitted, rather than one this '
          + 'instance issued. Public.',
        requestBody: JSON_BODY,
        responses: { 200: success('Validation result'), 400: BAD_REQUEST },
      },
    },

    '/credentials/{id}/certificate': {
      get: {
        tags: ['Credential'],
        summary: 'Render the certificate',
        description: 'Returns the certificate artwork. SVG is the default and is served inline, '
          + 'which is what the credential page uses as an image source. PNG and PDF are '
          + 'rendered from that same SVG on the server and sent as attachments, named after '
          + 'the recipient and achievement. Public.',
        parameters: [
          CREDENTIAL_ID,
          {
            name: 'format',
            in: 'query',
            required: false,
            description: 'Output format. Defaults to `svg`.',
            schema: { type: 'string', enum: ['svg', 'png', 'pdf'], default: 'svg' },
          },
        ],
        responses: {
          200: {
            description: 'The certificate. US Letter landscape (792x612pt) in every format.',
            content: {
              'image/svg+xml': { schema: { type: 'string' } },
              'image/png': { schema: { type: 'string', format: 'binary' } },
              'application/pdf': { schema: { type: 'string', format: 'binary' } },
            },
          },
          400: failure('Unsupported format - use svg, png or pdf'),
          404: NOT_FOUND,
        },
      },
    },

    '/credentials/{credentialId}/status': {
      get: {
        tags: ['Credential'],
        summary: 'Revocation status of a credential',
        description: 'Answers the narrower question of whether the credential has been revoked, '
          + 'without re-checking its signature or expiry the way /verify does. Served by the '
          + 'revocation-list API. Public.',
        parameters: [pathId('credentialId', 'The `urn:uuid:` credentialId.')],
        responses: { 200: success('Revocation status'), 404: NOT_FOUND },
      },
    },

    '/status-lists/{id}': {
      get: {
        tags: ['Credential'],
        summary: 'StatusList2021Credential for an issuer',
        description: 'The status list a credential\'s `credentialStatus.statusListCredential` '
          + 'points at. Returns a signed StatusList2021Credential whose '
          + '`credentialSubject.encodedList` is a GZIP-compressed, base64url-encoded bitstring; '
          + 'bit N is set if the credential holding `statusListIndex` N has been revoked. '
          + 'Public and deliberately so - a third-party verifier has to be able to fetch this '
          + 'without an account here. Carries no recipient data.',
        parameters: [pathId('id', 'Revocation list row id.')],
        responses: { 200: success('StatusList2021Credential'), 404: NOT_FOUND },
      },
    },

    '/verify/{id}': {
      get: {
        tags: ['Credential'],
        summary: 'Certificate by credential id, short form',
        description: 'The URL a certificate QR code points at. Public.',
        parameters: [CREDENTIAL_ID],
        responses: { 200: success('Certificate'), 404: NOT_FOUND },
      },
    },

    // ---- Credential: authenticated ----------------------------------------
    '/credentials/issue': {
      post: {
        tags: ['Credential'],
        summary: 'Issue a credential to one recipient',
        description: 'Creates and signs a credential. The achievement must belong to a profile '
          + 'the caller owns.',
        security: AUTHENTICATED,
        requestBody: JSON_BODY,
        responses: {
          200: success('The issued credential'),
          400: BAD_REQUEST,
          401: UNAUTHORIZED,
          403: failure('You can only issue for achievements you own'),
        },
      },
    },

    '/credentials/batch-issue': {
      post: {
        tags: ['Credential'],
        summary: 'Issue to a whole cohort',
        description: 'The endpoint behind CSV upload. Signs one credential per recipient and '
          + 'reports per-row outcomes.',
        security: AUTHENTICATED,
        requestBody: JSON_BODY,
        responses: { 200: success('Per-recipient results'), 400: BAD_REQUEST, 401: UNAUTHORIZED },
      },
    },

    '/credentials/{id}/revoke': {
      post: {
        tags: ['Credential'],
        summary: 'Revoke a credential',
        description: 'Adds the credential to its revocation list, so verification starts '
          + 'failing for it.',
        security: AUTHENTICATED,
        parameters: [CREDENTIAL_ID],
        responses: { 200: success('Revoked'), 401: UNAUTHORIZED, 404: NOT_FOUND },
      },
    },

    '/credentials/{id}/renew': {
      post: {
        tags: ['Credential'],
        summary: 'Renew a credential with a new expiry',
        security: AUTHENTICATED,
        parameters: [CREDENTIAL_ID],
        responses: { 200: success('Renewed credential'), 401: UNAUTHORIZED, 404: NOT_FOUND },
      },
    },

    '/credentials/{id}/export': {
      get: {
        tags: ['Credential'],
        summary: 'Export one credential as Open Badges JSON',
        security: AUTHENTICATED,
        parameters: [CREDENTIAL_ID],
        responses: { 200: success('Open Badges 3.0 document'), 401: UNAUTHORIZED, 404: NOT_FOUND },
      },
    },

    '/credentials/import': {
      post: {
        tags: ['Credential'],
        summary: 'Import an externally issued credential',
        security: AUTHENTICATED,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['certificateData'],
                properties: { certificateData: { type: 'object' } },
              },
            },
          },
        },
        responses: { 200: success('The imported credential'), 400: BAD_REQUEST, 401: UNAUTHORIZED },
      },
    },

    '/credentials/expiration-check': {
      post: {
        tags: ['Credential'],
        summary: 'Run the expiry scan now',
        description: 'Normally runs on a daily timer; this triggers it on demand.',
        security: AUTHENTICATED,
        responses: { 200: success('Scan summary'), 401: UNAUTHORIZED },
      },
    },

    // ---- Profile: the current user ----------------------------------------
    '/profiles/me': {
      get: {
        tags: ['Profile'],
        summary: 'The signed-in user profile',
        description: 'Resolved from the token, by matching the account email.',
        security: AUTHENTICATED,
        responses: {
          200: success('Profile'),
          401: UNAUTHORIZED,
          404: failure('No profile is linked to this account'),
        },
      },
      put: {
        tags: ['Profile'],
        summary: 'Update the signed-in user profile',
        description: 'Only `name`, `organization` and `description` are writable. `email` is '
          + 'not: every /profiles/me route finds the profile by the account email, so letting '
          + 'the two drift apart would orphan the profile and lock its owner out of their own '
          + 'data. Anything else in the body is dropped rather than trusted.',
        security: AUTHENTICATED,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      organization: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: success('The updated profile'),
          400: failure('No editable fields supplied, or an empty name'),
          401: UNAUTHORIZED,
          404: failure('No profile is linked to this account'),
        },
      },
    },

    '/profiles/me/export': {
      get: {
        tags: ['Profile'],
        summary: 'Export everything tied to this profile',
        description: 'Achievements it created, credentials it issued or received, and their '
          + 'evidence.',
        security: AUTHENTICATED,
        responses: { 200: success('Portable data bundle'), 401: UNAUTHORIZED },
      },
    },

    '/profiles/me/import': {
      post: {
        tags: ['Profile'],
        summary: 'Restore a previously exported bundle',
        description: 'Accepts only what /profiles/me/export produced for this profile - never '
          + 'another profile data, and never credentials merely received by it.',
        security: AUTHENTICATED,
        requestBody: JSON_BODY,
        responses: { 200: success('Import summary'), 400: BAD_REQUEST, 401: UNAUTHORIZED },
      },
    },

    '/profiles/me/data': {
      delete: {
        tags: ['Profile'],
        summary: 'Erase this profile and its data (GDPR)',
        description: 'Irreversible. Requires `{ "confirm": true }` in the body so it cannot be '
          + 'triggered by accident. Certificates already issued stop verifying.',
        security: AUTHENTICATED,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['confirm'],
                properties: { confirm: { type: 'boolean', enum: [true] } },
              },
            },
          },
        },
        responses: {
          200: success('What was deleted'),
          400: failure('Deletion requires explicit confirmation'),
          401: UNAUTHORIZED,
        },
      },
    },

    '/dashboard/stats': {
      get: {
        tags: ['Profile'],
        summary: 'Issuance analytics for the signed-in profile',
        security: AUTHENTICATED,
        responses: { 200: success('Counts and a twelve-month trend'), 401: UNAUTHORIZED },
      },
    },

    // ---- Profile: by id ----------------------------------------------------
    '/profiles/{id}/issued-credentials': {
      get: {
        tags: ['Profile'],
        summary: 'Credentials this profile issued',
        security: AUTHENTICATED,
        parameters: [PROFILE_ID],
        responses: { 200: success('Credential list'), 401: UNAUTHORIZED, 404: NOT_FOUND },
      },
    },

    '/profiles/{id}/received-credentials': {
      get: {
        tags: ['Profile'],
        summary: 'Credentials this profile received',
        security: AUTHENTICATED,
        parameters: [PROFILE_ID],
        responses: { 200: success('Credential list'), 401: UNAUTHORIZED, 404: NOT_FOUND },
      },
    },

    '/profiles/{id}/keys': {
      get: {
        tags: ['Profile'],
        summary: 'Public signing keys for this issuer',
        description: 'Public, so a third-party verifier can check a signature without an '
          + 'account here.',
        parameters: [PROFILE_ID],
        responses: { 200: success('Public keys'), 404: NOT_FOUND },
      },
    },

    '/profiles/{id}/.well-known/jwks.json': {
      get: {
        tags: ['Profile'],
        summary: 'The issuer keys as a JWKS',
        description: 'The same keys in the standard JSON Web Key Set form. Public.',
        parameters: [PROFILE_ID],
        responses: { 200: success('JWKS'), 404: NOT_FOUND },
      },
    },

    '/profiles/{id}/issuer': {
      get: {
        tags: ['Profile'],
        summary: 'The profile as an Open Badges issuer',
        description: 'Public.',
        parameters: [PROFILE_ID],
        responses: { 200: success('Open Badges issuer object'), 404: NOT_FOUND },
      },
    },

    // ---- Endorsement -------------------------------------------------------
    '/endorsements/{id}/verify': {
      get: {
        tags: ['Endorsement'],
        summary: 'Verify an endorsement',
        parameters: [pathId('id', 'Endorsement id.')],
        responses: { 200: success('Verification result'), 404: NOT_FOUND },
      },
    },

    // ---- Achievement -------------------------------------------------------
    '/achievements/create': {
      post: {
        tags: ['Achievement'],
        summary: 'Create an achievement, bound to the caller',
        description: 'Takes the creator from the token rather than the body, so an achievement '
          + 'cannot be attributed to someone else.',
        security: AUTHENTICATED,
        requestBody: JSON_BODY,
        responses: { 200: success('The achievement'), 400: BAD_REQUEST, 401: UNAUTHORIZED },
      },
    },

    '/achievements/{id}/credentials': {
      get: {
        tags: ['Achievement'],
        summary: 'An achievement together with the credentials issued from it',
        parameters: [pathId('id', 'Achievement id.')],
        responses: { 200: success('Achievement and credentials'), 404: NOT_FOUND },
      },
    },

    '/achievements/creator/{creatorId}': {
      get: {
        tags: ['Achievement'],
        summary: 'Achievements created by a profile',
        description: 'What the issue page template picker reads.',
        security: AUTHENTICATED,
        parameters: [pathId('creatorId', 'Creator profile id.')],
        responses: { 200: success('Achievement list'), 401: UNAUTHORIZED },
      },
    },
  },
}
