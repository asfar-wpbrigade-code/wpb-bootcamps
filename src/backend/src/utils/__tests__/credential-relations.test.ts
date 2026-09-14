import { resolveAchievement, resolveIssuer } from '../credential-relations'

/**
 * A fake holding one published achievement and one published profile, findable
 * only by documentId - which is the situation after a republish: the row is
 * there, and nothing links the credential to it any more.
 */
function fakeStrapi() {
  const queries: Array<{ uid: string, where: any }> = []

  const rows: Record<string, any> = {
    'api::achievement.achievement': {
      id: 42,
      documentId: 'ach-doc-id',
      name: 'SEO Fundamentals',
      publishedAt: '2026-09-01T00:00:00.000Z',
      creator: { id: 7, name: 'WPBrigade' },
    },
    'api::profile.profile': {
      id: 7,
      documentId: 'issuer-doc-id',
      name: 'WPBrigade',
      publishedAt: '2026-09-01T00:00:00.000Z',
    },
  }

  return {
    queries,
    strapi: {
      db: {
        query: (uid: string) => ({
          findOne: async ({ where }: any) => {
            queries.push({ uid, where })
            const row = rows[uid]
            return row && where.documentId === row.documentId ? row : null
          },
        }),
      },
    },
  }
}

describe('resolving a credential’s achievement', () => {
  it('uses the relation when it is there', async () => {
    const { strapi, queries } = fakeStrapi()
    const credential = { achievement: { id: 99, name: 'From the relation' }, achievementDocumentId: 'ach-doc-id' }

    const achievement = await resolveAchievement(strapi, credential)

    expect(achievement.name).toBe('From the relation')
    // The relation is what Strapi maintains and populates; the documentId is
    // only a fallback, so a healthy credential costs no extra query.
    expect(queries).toEqual([])
  })

  it('falls back to the documentId when the relation has gone', async () => {
    // The production failure: an achievement was edited, Strapi 5 replaced its
    // published row, and every link row pointing at the old id was orphaned.
    const { strapi } = fakeStrapi()
    const credential = { achievement: null, achievementDocumentId: 'ach-doc-id' }

    const achievement = await resolveAchievement(strapi, credential)

    expect(achievement.id).toBe(42)
    expect(achievement.creator).toEqual({ id: 7, name: 'WPBrigade' })
  })

  it('asks only for a published row', async () => {
    // An unpublished achievement is not one a certificate should resolve to.
    const { strapi, queries } = fakeStrapi()

    await resolveAchievement(strapi, { achievement: null, achievementDocumentId: 'ach-doc-id' })

    expect(queries[0].where.publishedAt).toEqual({ $notNull: true })
  })

  it('returns null when there is no documentId to fall back to', async () => {
    // Credentials issued before this was recorded. Nothing to recover from,
    // and the caller says so rather than throwing a TypeError.
    const { strapi } = fakeStrapi()

    expect(await resolveAchievement(strapi, { achievement: null })).toBeNull()
  })

  it('returns null when the documentId names nothing', async () => {
    const { strapi } = fakeStrapi()

    expect(await resolveAchievement(strapi, { achievement: null, achievementDocumentId: 'gone' })).toBeNull()
  })
})

describe('resolving a credential’s issuer', () => {
  it('uses the relation when it is there', async () => {
    const { strapi, queries } = fakeStrapi()

    const issuer = await resolveIssuer(strapi, { issuer: { id: 99 }, issuerDocumentId: 'issuer-doc-id' })

    expect(issuer.id).toBe(99)
    expect(queries).toEqual([])
  })

  it('falls back to the documentId when the relation has gone', async () => {
    // The earlier production failure: a profile was renamed.
    const { strapi } = fakeStrapi()

    const issuer = await resolveIssuer(strapi, { issuer: null, issuerDocumentId: 'issuer-doc-id' })

    expect(issuer.id).toBe(7)
    expect(issuer.name).toBe('WPBrigade')
  })

  it('returns null when there is nothing to resolve', async () => {
    const { strapi } = fakeStrapi()

    expect(await resolveIssuer(strapi, { issuer: null })).toBeNull()
    expect(await resolveIssuer(strapi, null)).toBeNull()
  })
})
