import credentialFactory from '../credential'

/**
 * Renaming a recipient must not disturb the rows that point at their profile.
 *
 * Issuing to an address that already has a profile brings the profile's name
 * up to date with whatever the issuer typed. That was done through
 * `entityService.update(..., { publishedAt })`, which republishes - and a
 * Strapi 5 republish deletes the published row and inserts a new one. With
 * `credentials_recipient_lnk.profile_id` declared ON DELETE CASCADE, the
 * delete took the recipient link off every certificate already issued to that
 * person: those certificates rendered the word "Recipient" in place of a name,
 * and vanished from the recipient's dashboard, which lists them through the
 * same link.
 *
 * A name is a scalar with no relations to maintain, so it is written in place
 * instead.
 */
function createService() {
  const updateMany = jest.fn(async () => ({ count: 1 }))
  const entityUpdate = jest.fn()

  const strapi: any = {
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    entityService: { update: entityUpdate },
    db: { query: () => ({ updateMany }) },
    // The service is built with factories.createCoreService, which reads the
    // content type at construction. Only the shape matters here.
    contentType: () => ({
      uid: 'api::credential.credential',
      kind: 'collectionType',
      info: { singularName: 'credential', pluralName: 'credentials' },
      attributes: {},
    }),
  }

  return { service: credentialFactory({ strapi }), updateMany, entityUpdate }
}

const PROFILE = {
  id: 105,
  documentId: 'abc123documentid',
  name: 'the three',
  email: 'recipient@example.com',
}

describe('syncRecipientName', () => {
  it('writes the name in place, without republishing the profile', async () => {
    const { service, updateMany, entityUpdate } = createService()

    await service.syncRecipientName(PROFILE, 'Adnan Gill')

    expect(updateMany).toHaveBeenCalledWith({
      where: { documentId: PROFILE.documentId },
      data: { name: 'Adnan Gill' },
    })
    // The republish is the whole bug: nothing may go through entityService,
    // and no write may carry publishedAt.
    expect(entityUpdate).not.toHaveBeenCalled()
    expect(JSON.stringify(updateMany.mock.calls)).not.toContain('publishedAt')
  })

  it('returns the profile with its row id unchanged, so the caller can link to it', async () => {
    const { service } = createService()

    const result = await service.syncRecipientName(PROFILE, 'Adnan Gill')

    expect(result.id).toBe(PROFILE.id)
    expect(result.name).toBe('Adnan Gill')
  })

  it('does nothing when the name is unchanged', async () => {
    const { service, updateMany } = createService()

    const result = await service.syncRecipientName(PROFILE, 'the three')

    expect(updateMany).not.toHaveBeenCalled()
    expect(result).toBe(PROFILE)
  })

  it('does nothing when no name was supplied', async () => {
    const { service, updateMany } = createService()

    expect(await service.syncRecipientName(PROFILE, '   ')).toBe(PROFILE)
    expect(await service.syncRecipientName(PROFILE, undefined)).toBe(PROFILE)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('trims the supplied name', async () => {
    const { service, updateMany } = createService()

    await service.syncRecipientName(PROFILE, '  Adnan Gill  ')

    expect(updateMany).toHaveBeenCalledWith({
      where: { documentId: PROFILE.documentId },
      data: { name: 'Adnan Gill' },
    })
  })

  it('falls back to the row id when the profile has no documentId', async () => {
    const { service, updateMany } = createService()

    await service.syncRecipientName({ ...PROFILE, documentId: undefined }, 'Adnan Gill')

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: PROFILE.id },
      data: { name: 'Adnan Gill' },
    })
  })
})
