import { revocationListExtension } from '../revocation-list'

const LIST_UID = 'api::revocation-list.revocation-list'

/**
 * The fake here has to mirror the three data access styles the service uses,
 * because each was adopted for a reason:
 *
 * - `entityService` for the issuer profile lookup;
 * - `db.query` for the list itself, avoiding draft/publish ambiguity on a
 *   freshly created row (see the notes in the service);
 * - `db.connection` for reserving an index, which has to be one atomic
 *   UPDATE ... RETURNING rather than a read followed by a write.
 *
 * This fake previously only implemented `entityService`, so the whole suite
 * had been failing silently since the service moved to `db.query`.
 */
function createFakeStrapi() {
  const profiles = new Map<number, any>([[1, { id: 1, name: 'Test Issuer' }]])
  const lists = new Map<number, any>()
  let nextId = 1

  /** Just enough knex to satisfy `.where(...).increment(...).returning(...)`. */
  function connection(table: string) {
    if (table !== 'revocation_lists') throw new Error(`Unexpected table: ${table}`)

    let row: any = null
    let result: any[] = []

    const chain: any = {
      where: (criteria: any) => {
        row = lists.get(criteria.id) ?? null
        return chain
      },
      increment: (column: string, by: number) => {
        if (column !== 'next_index') throw new Error(`Unexpected column: ${column}`)
        if (row) {
          row.nextIndex = (row.nextIndex ?? 0) + by
          // The real column is snake_case; the entity field is camelCase.
          result = [{ next_index: row.nextIndex }]
        }
        return chain
      },
      returning: async () => result,
    }

    return chain
  }

  return {
    strapi: {
      entityService: {
        findOne: async (contentType: string, id: number) => {
          if (contentType === 'api::profile.profile') return profiles.get(id) || null
          if (contentType === LIST_UID) return lists.get(id) || null
          throw new Error(`Unexpected content type: ${contentType}`)
        },
      },
      db: {
        connection,
        query: (uid: string) => {
          if (uid !== LIST_UID) throw new Error(`Unexpected content type: ${uid}`)

          return {
            findOne: async ({ where }: any) => lists.get(where.id) ?? null,
            findMany: async ({ where }: any) => [...lists.values()].filter(
              list => list.issuer === where.issuer && list.statusPurpose === where.statusPurpose
            ),
            create: async ({ data }: any) => {
              const record = { id: nextId++, ...data }
              lists.set(record.id, record)
              return record
            },
            update: async ({ where, data }: any) => {
              const updated = { ...lists.get(where.id), ...data }
              lists.set(where.id, updated)
              return updated
            },
          }
        },
      },
    },
    lists,
  }
}

describe('revocation-list service', () => {
  it('creates an empty status list for an issuer', async () => {
    const { strapi } = createFakeStrapi()
    const service = revocationListExtension({ strapi } as any)

    const list = await service.createStatusListCredential(1)

    expect(list.issuer).toBe(1)
    expect(list.nextIndex).toBe(0)
    expect(list.statusListCredential).toMatch(/^urn:uuid:/)
  })

  it('getOrCreateActiveListForIssuer reuses an existing list', async () => {
    const { strapi, lists } = createFakeStrapi()
    const service = revocationListExtension({ strapi } as any)

    const first = await service.getOrCreateActiveListForIssuer(1)
    const second = await service.getOrCreateActiveListForIssuer(1)

    expect(second.id).toBe(first.id)
    expect(lists.size).toBe(1)
  })

  it('assignNextIndex hands out sequential, non-repeating indices', async () => {
    const { strapi } = createFakeStrapi()
    const service = revocationListExtension({ strapi } as any)
    const list = await service.createStatusListCredential(1)

    const first = await service.assignNextIndex(list.id)
    const second = await service.assignNextIndex(list.id)

    expect(first).toBe(0)
    expect(second).toBe(1)
  })

  it('checkStatusInList is false for an empty list', async () => {
    const { strapi } = createFakeStrapi()
    const service = revocationListExtension({ strapi } as any)
    const list = await service.createStatusListCredential(1)

    expect(await service.checkStatusInList(list, 0)).toBe(false)
  })

  it('revokeCredentialInStatusList flips the bit, checkStatusInList sees it', async () => {
    const { strapi } = createFakeStrapi()
    const service = revocationListExtension({ strapi } as any)
    const list = await service.createStatusListCredential(1)
    const index = await service.assignNextIndex(list.id)

    await service.revokeCredentialInStatusList(list.id, index)
    const updatedList = await strapi.entityService.findOne('api::revocation-list.revocation-list', list.id)

    expect(await service.checkStatusInList(updatedList, index)).toBe(true)
    expect(await service.checkStatusInList(updatedList, index + 1)).toBe(false)
  })

  it('revokeCredentialInStatusList is idempotent (revoking twice keeps one entry)', async () => {
    const { strapi } = createFakeStrapi()
    const service = revocationListExtension({ strapi } as any)
    const list = await service.createStatusListCredential(1)

    await service.revokeCredentialInStatusList(list.id, 5)
    await service.revokeCredentialInStatusList(list.id, 5)
    const updatedList = await strapi.entityService.findOne('api::revocation-list.revocation-list', list.id)

    expect(updatedList.encodedList).toBe('5')
  })
})
