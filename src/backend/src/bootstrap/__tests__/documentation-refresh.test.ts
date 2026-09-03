import { refreshApiDocumentation } from '../documentation-refresh'

function createFakeStrapi(options: { plugin?: boolean, throws?: boolean } = {}) {
  const { plugin = true, throws = false } = options
  const generateFullDoc = jest.fn(async () => {
    if (throws) throw new Error('no writable extensions directory')
  })

  return {
    generateFullDoc,
    strapi: {
      log: { info: jest.fn(), error: jest.fn() },
      plugin: (name: string) => {
        if (name !== 'documentation' || !plugin) return undefined
        return { service: () => ({ generateFullDoc }) }
      },
    } as any,
  }
}

describe('refreshApiDocumentation', () => {
  const original = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = original
  })

  it('regenerates the spec in production, where the plugin will not', async () => {
    process.env.NODE_ENV = 'production'
    const { strapi, generateFullDoc } = createFakeStrapi()

    await refreshApiDocumentation(strapi)

    expect(generateFullDoc).toHaveBeenCalledTimes(1)
    expect(strapi.log.info).toHaveBeenCalled()
  })

  it('leaves it alone outside production, where the plugin already did it', async () => {
    process.env.NODE_ENV = 'development'
    const { strapi, generateFullDoc } = createFakeStrapi()

    await refreshApiDocumentation(strapi)

    expect(generateFullDoc).not.toHaveBeenCalled()
  })

  it('does not throw when the documentation plugin is absent', async () => {
    process.env.NODE_ENV = 'production'
    const { strapi } = createFakeStrapi({ plugin: false })

    await expect(refreshApiDocumentation(strapi)).resolves.toBeUndefined()
  })

  it('logs and swallows a generation failure rather than blocking startup', async () => {
    process.env.NODE_ENV = 'production'
    const { strapi } = createFakeStrapi({ throws: true })

    await expect(refreshApiDocumentation(strapi)).resolves.toBeUndefined()
    expect(strapi.log.error).toHaveBeenCalledWith(
      expect.stringContaining('no writable extensions directory'),
    )
  })
})
