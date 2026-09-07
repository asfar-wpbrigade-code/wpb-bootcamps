import certificateFactory from '../certificate'

const CREDENTIAL = {
  id: 7,
  credentialId: 'urn:uuid:2f8a1c3e-0000-4000-8000-abcdefabcdef',
  name: 'Advanced WordPress Engineering',
  issuanceDate: '2026-08-01T00:00:00.000Z',
  recipient: { name: 'Ada Lovelace' },
  issuer: { name: 'WPBrigade' },
  achievement: {
    name: 'Advanced WordPress Engineering',
    description: 'Completed the advanced engineering track.',
    signatoryName: 'Grace Hopper',
    signatoryTitle: 'Programme Director',
  },
}

function createService(credential: any = CREDENTIAL) {
  const strapi: any = {
    config: { get: (_key: string, fallback: string) => fallback },
    log: { warn: jest.fn() },
    dirs: { static: { public: '/nonexistent' } },
    db: {
      query: () => ({
        findOne: async ({ where }: any) =>
          where.credentialId === credential?.credentialId ? credential : null,
      }),
    },
  }

  return certificateFactory({ strapi })
}

// Rasterising at 4x for the PDF is real work.
jest.setTimeout(60000)

describe('certificate service formats', () => {
  it('serves SVG as the inline default', async () => {
    const result = await createService().generateCertificateFile(CREDENTIAL.credentialId, 'svg')

    expect(result.contentType).toBe('image/svg+xml')
    expect(String(result.body).trimStart().startsWith('<?xml')).toBe(true)
    expect(String(result.body)).toContain('<svg')
  })

  it('renders a PNG', async () => {
    const result = await createService().generateCertificateFile(CREDENTIAL.credentialId, 'png')

    expect(result.contentType).toBe('image/png')
    expect((result.body as Buffer).subarray(1, 4).toString()).toBe('PNG')
  })

  it('renders a PDF', async () => {
    const result = await createService().generateCertificateFile(CREDENTIAL.credentialId, 'pdf')

    expect(result.contentType).toBe('application/pdf')
    expect((result.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('names the file after the recipient and achievement', async () => {
    const result = await createService().generateCertificateFile(CREDENTIAL.credentialId, 'pdf')

    expect(result.filename).toBe('Ada-Lovelace-Advanced-WordPress-Engineering.pdf')
  })

  it('strips characters a filename cannot carry', async () => {
    const awkward = {
      ...CREDENTIAL,
      recipient: { name: 'Ada / Lovelace: "the first"' },
      achievement: { ...CREDENTIAL.achievement, name: 'C++ & Friends' },
    }
    const result = await createService(awkward).generateCertificateFile(awkward.credentialId, 'png')

    expect(result.filename).toBe('Ada-Lovelace-the-first-C-Friends.png')
    expect(result.filename).not.toMatch(/[/\:"*?<>|]/)
  })

  it('rejects a credential that does not exist', async () => {
    await expect(createService().generateCertificateFile('urn:uuid:missing', 'pdf'))
      .rejects.toThrow('Credential not found')
  })
})

describe('whose name the certificate carries', () => {
  // A certificate records something that happened. The name printed on it is
  // the name as awarded, so it cannot follow later edits to the person's
  // profile - and it has to survive the profile link being lost entirely,
  // which is what used to print the literal word "Recipient" on real
  // certificates. See services/credential.ts syncRecipientName.
  it('prefers the name recorded on the credential over the profile', async () => {
    const renamed = {
      ...CREDENTIAL,
      recipientName: 'Ada Lovelace',
      recipient: { name: 'Ada Byron' },
    }

    const result = await createService(renamed).generateCertificateFile(renamed.credentialId, 'svg')

    expect(String(result.body)).toContain('Ada Lovelace')
    expect(String(result.body)).not.toContain('Ada Byron')
    expect(result.filename).toBe('Ada-Lovelace-Advanced-WordPress-Engineering.svg')
  })

  it('still names the recipient when the profile link is gone', async () => {
    const orphaned = { ...CREDENTIAL, recipientName: 'Ada Lovelace', recipient: null }

    const result = await createService(orphaned).generateCertificateFile(orphaned.credentialId, 'svg')

    expect(String(result.body)).toContain('Ada Lovelace')
    expect(result.filename).toBe('Ada-Lovelace-Advanced-WordPress-Engineering.svg')
  })

  it('falls back to the placeholder only when no name was recorded at all', async () => {
    const nameless = { ...CREDENTIAL, recipientName: null, recipient: null }

    const result = await createService(nameless).generateCertificateFile(nameless.credentialId, 'svg')

    expect(result.filename).toBe('Advanced-WordPress-Engineering.svg')
    expect(String(result.body)).toContain('<svg')
  })

  it('falls back to the profile for credentials issued before the field existed', async () => {
    const result = await createService().generateCertificateFile(CREDENTIAL.credentialId, 'svg')

    expect(String(result.body)).toContain('Ada Lovelace')
  })
})
