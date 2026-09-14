import openBadgeService from '../open-badge'

/**
 * A credential whose relations have gone underneath it.
 *
 * They do go: editing an achievement or a profile in the admin panel
 * republishes it, and a Strapi 5 republish deletes the published row and
 * inserts a new one, taking every link row that pointed at the old row with
 * it. It has happened to the issuer relation before - see
 * scripts/repair-issuer-links.js - and then to the achievement relation, which
 * is what these cover.
 *
 * The credential is intact and correctly signed in both cases. What is missing
 * is the path from it to the achievement or the issuer, and the error has to
 * say so: the achievement case used to answer "Cannot read properties of null
 * (reading 'creator')", a TypeError that names neither the relation nor the
 * credential and reads like a bug in verification rather than a missing row.
 */
function serviceWith(credential: any) {
  ;(global as any).strapi = {
    entityService: {
      findOne: async () => credential,
    },
    config: { get: (_key: string, fallback?: string) => fallback ?? 'http://localhost:1337' },
  }

  return openBadgeService({ strapi: (global as any).strapi })
}

const INTACT_ENOUGH = {
  id: 1,
  credentialId: 'urn:uuid:2f8a1c3e-0000-4000-8000-abcdefabcdef',
  name: 'SEO Fundamentals',
  issuanceDate: '2026-09-01T00:00:00.000Z',
  issuer: { id: 2, name: 'WPBrigade' },
  recipient: { id: 3, name: 'Ada Lovelace', email: 'ada@example.test' },
}

describe('serializing a credential whose relations have gone', () => {
  afterEach(() => {
    delete (global as any).strapi
  })

  it('names the achievement when its link is missing', async () => {
    const service = serviceWith({ ...INTACT_ENOUGH, achievement: null })

    await expect(service.serializeCredential(1)).rejects.toThrow(
      /missing an associated achievement/i,
    )
  })

  it('does not answer with a TypeError', async () => {
    // The regression itself. Reading `.creator` off a null achievement threw
    // "Cannot read properties of null", which reached the API as a 400 whose
    // message described neither the credential nor the relation.
    const service = serviceWith({ ...INTACT_ENOUGH, achievement: null })

    await expect(service.serializeCredential(1)).rejects.not.toThrow(TypeError)
    await expect(service.serializeCredential(1)).rejects.not.toThrow(/Cannot read properties/)
  })

  it('says the credential itself is intact, because it is', async () => {
    // Whoever reads this is deciding whether to re-issue. They should not have
    // to: the signature was made at issuance and is unaffected by a link row
    // disappearing later.
    const service = serviceWith({ ...INTACT_ENOUGH, achievement: null })

    await expect(service.serializeCredential(1)).rejects.toThrow(/intact/i)
  })

  it('still names the creator when the achievement is there without one', async () => {
    const service = serviceWith({ ...INTACT_ENOUGH, achievement: { id: 9, creator: null } })

    await expect(service.serializeCredential(1)).rejects.toThrow(
      /missing an associated achievement creator/i,
    )
  })

  it('still names the issuer when that is what is missing', async () => {
    const service = serviceWith({
      ...INTACT_ENOUGH,
      achievement: { id: 9, creator: { id: 2 } },
      issuer: null,
    })

    await expect(service.serializeCredential(1)).rejects.toThrow(
      /missing an associated issuer/i,
    )
  })
})
