import { refreshApiDocumentation, registerCustomRouteDocumentation } from '../documentation-refresh'

function createFakeStrapi(options: { plugin?: boolean, throws?: boolean } = {}) {
  const { plugin = true, throws = false } = options
  const generateFullDoc = jest.fn(async () => {
    if (throws) throw new Error('no writable extensions directory')
  })
  const registerOverride = jest.fn()
  const excludeFromGeneration = jest.fn()

  return {
    generateFullDoc,
    registerOverride,
    excludeFromGeneration,
    strapi: {
      log: { info: jest.fn(), error: jest.fn() },
      plugin: (name: string) => {
        if (name !== 'documentation' || !plugin) return undefined
        return {
          service: (service: string) =>
            service === 'override'
              ? { registerOverride, excludeFromGeneration }
              : { generateFullDoc },
        }
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

  it('registers the custom route documentation', () => {
    const { strapi, registerOverride } = createFakeStrapi()

    registerCustomRouteDocumentation(strapi)

    expect(registerOverride).toHaveBeenCalledTimes(1)
    const [override, opts] = registerOverride.mock.calls[0]
    expect(Object.keys(override.paths).length).toBeGreaterThan(20)
    // No opts, and specifically no excludeFromGeneration: the override has to
    // merge over the generated paths, not replace an API's documentation.
    expect(opts).toBeUndefined()
  })

  it('never excludes an API from generation while registering', () => {
    const { strapi, excludeFromGeneration } = createFakeStrapi()

    registerCustomRouteDocumentation(strapi)

    expect(excludeFromGeneration).not.toHaveBeenCalled()
  })

  it('does not throw registering when the plugin is absent', () => {
    const { strapi, registerOverride } = createFakeStrapi({ plugin: false })

    expect(() => registerCustomRouteDocumentation(strapi)).not.toThrow()
    expect(registerOverride).not.toHaveBeenCalled()
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
