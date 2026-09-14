import certificateFactory from '../certificate'

/**
 * A certificate whose achievement link has gone underneath it.
 *
 * Editing an achievement in the admin panel republishes it, and a Strapi 5
 * republish deletes the published row and inserts a new one, orphaning every
 * link row that pointed at the old one. The credential survives that; the path
 * from it to the achievement does not.
 *
 * On the certificate this is quiet and specific. The recipient's name, the
 * achievement's name and its description are all recorded on the credential
 * itself, so they still print. The signature block is not: the signature
 * image, the signatory's name and their title live only on the achievement, so
 * a single save in the admin panel prints every later certificate with no
 * signature on it - and with the issuer's name where the signatory's should
 * be, because that is the template's fallback. Nothing errors.
 *
 * serializeCredential and verifyProof already resolve through the documentIds
 * the credential records alongside the relations. The certificate was the read
 * path that did not.
 */
const ACHIEVEMENT = {
  id: 42,
  documentId: 'ach_doc_1',
  name: 'Advanced WordPress Engineering',
  description: 'Completed the advanced engineering track.',
  signatoryName: 'Grace Hopper',
  signatoryTitle: 'Programme Director',
}

const ISSUER = { id: 9, documentId: 'iss_doc_1', name: 'WPBrigade' }

/** A credential with both relations orphaned, as a republish leaves them. */
const ORPHANED = {
  id: 7,
  credentialId: 'urn:uuid:2f8a1c3e-0000-4000-8000-abcdefabcdef',
  name: 'Advanced WordPress Engineering',
  issuanceDate: '2026-08-01T00:00:00.000Z',
  recipientName: 'Ada Lovelace',
  recipient: { name: 'Ada Lovelace' },
  achievement: null,
  issuer: null,
  achievementDocumentId: ACHIEVEMENT.documentId,
  issuerDocumentId: ISSUER.documentId,
}

/**
 * @param {object} credential - The credential the certificate is asked for
 * @param {object} rows - What the achievement and profile tables still hold
 */
function createService(credential: any, rows: { achievement?: any, issuer?: any } = {}) {
  // A copy, because resolving fills the relations in on the row itself - and
  // these fixtures are shared, so a test that ran earlier would otherwise hand
  // the next one a credential that had already been repaired.
  const row = credential && { ...credential }

  const strapi: any = {
    config: { get: (_key: string, fallback: string) => fallback },
    log: { warn: jest.fn() },
    dirs: { static: { public: '/nonexistent' } },
    db: {
      query: (uid: string) => ({
        findOne: async ({ where }: any) => {
          if (uid === 'api::credential.credential') {
            return where.credentialId === row?.credentialId ? row : null
          }
          if (uid === 'api::achievement.achievement') {
            const found = rows.achievement ?? ACHIEVEMENT
            return where.documentId === found.documentId ? found : null
          }
          if (uid === 'api::profile.profile') {
            const found = rows.issuer ?? ISSUER
            return where.documentId === found.documentId ? found : null
          }
          return null
        },
      }),
    },
  }

  return certificateFactory({ strapi })
}

// Rasterising for the PDF is real work; the SVG cases are cheap.
jest.setTimeout(60000)

describe('a certificate whose relations were orphaned by a republish', () => {
  it('still signs it, resolving the achievement through its documentId', async () => {
    const result = await createService(ORPHANED)
      .generateCertificateFile(ORPHANED.credentialId, 'svg')

    // The regression: without the fallback these are simply absent, and the
    // signature reads WPBRIGADE - the issuer - instead.
    expect(String(result.body)).toContain('GRACE HOPPER')
    expect(String(result.body)).toContain('Programme Director')
  })

  it('resolves the issuer through its documentId too', async () => {
    // Asserted on the credential rather than the artwork: the issuer's name is
    // drawn only where a signatory is missing, so a certificate that has one
    // never prints it. It still reaches the PDF's author metadata, and
    // verification reads the issuer's public key through this same relation.
    const credential = await createService(ORPHANED)
      .findCredentialForCertificate(ORPHANED.credentialId)

    expect(credential.issuer?.name).toBe('WPBrigade')
    expect(credential.achievement?.signatoryName).toBe('Grace Hopper')
  })

  it('prefers the relation when it is intact, without a second query', async () => {
    const intact = {
      ...ORPHANED,
      achievement: { ...ACHIEVEMENT, signatoryName: 'Ada King' },
      issuer: ISSUER,
    }
    // Resolving through the documentId would find ACHIEVEMENT, not this one.
    const result = await createService(intact).generateCertificateFile(intact.credentialId, 'svg')

    expect(String(result.body)).toContain('ADA KING')
    expect(String(result.body)).not.toContain('GRACE HOPPER')
  })

  it('renders rather than fails when the achievement cannot be found at all', async () => {
    // The row is gone, not merely unlinked - the fallback has nothing to find.
    // A certificate with no signature beats a 500 for whoever asked for it.
    const unrecoverable = { ...ORPHANED, achievementDocumentId: null }
    const result = await createService(unrecoverable)
      .generateCertificateFile(unrecoverable.credentialId, 'svg')

    expect(String(result.body)).toContain('<svg')
    expect(String(result.body)).toContain('Ada Lovelace')
  })
})
