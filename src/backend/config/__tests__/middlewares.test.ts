import middlewaresConfig from '../middlewares'

function buildOriginFn(extraOrigins: string[] = []) {
  const middlewares = (middlewaresConfig as any)({
    env: {
      array: (_key: string, defaultValue: string[]) => extraOrigins.length ? extraOrigins : defaultValue,
    },
  })
  const corsMiddleware = middlewares.find((m: any) => typeof m === 'object' && m.name === 'strapi::cors')
  return corsMiddleware.config.origin
}

function ctxWithOrigin(origin?: string) {
  return { request: { header: { origin } } }
}

describe('CORS origin function', () => {
  it('allows a default whitelisted origin', () => {
    const origin = buildOriginFn()
    expect(origin(ctxWithOrigin('https://bootcamp.wpbrigade.com'))).toBe('https://bootcamp.wpbrigade.com')
  })

  it('does not throw and returns a string for a non-whitelisted origin (regression for #75)', () => {
    const origin = buildOriginFn()
    const result = origin(ctxWithOrigin('https://evil.example.com'))
    expect(typeof result).toBe('string')
    expect(result).toBe('')
  })

  it('returns an empty string when there is no Origin header at all', () => {
    const origin = buildOriginFn()
    expect(origin(ctxWithOrigin(undefined))).toBe('')
  })

  it('allows an origin added via CORS_ALLOWED_ORIGINS', () => {
    const origin = buildOriginFn(['https://badges.example.org'])
    expect(origin(ctxWithOrigin('https://badges.example.org'))).toBe('https://badges.example.org')
  })

  it('still rejects origins not in the extended list', () => {
    const origin = buildOriginFn(['https://badges.example.org'])
    expect(origin(ctxWithOrigin('https://not-allowed.example.com'))).toBe('')
  })

  it('rejects the upstream project domains and deploy previews', () => {
    const origin = buildOriginFn()
    // Removed in c5ab9ce: a wildcard for the upstream project's Netlify
    // previews meant anyone opening a pull request there got an origin this
    // API trusted. These must stay rejected.
    expect(origin(ctxWithOrigin('https://deploy-preview-42--certo.netlify.app'))).toBe('')
    expect(origin(ctxWithOrigin('https://certo.schroedinger-hat.org'))).toBe('')
    expect(origin(ctxWithOrigin('https://certo.netlify.app'))).toBe('')
  })
})
