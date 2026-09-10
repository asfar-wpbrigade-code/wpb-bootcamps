/**
 * The password-reset email and the API docs title were hardcoded to "Certo",
 * the upstream project's name, so WPBrigade's users were told to reset a
 * "Certo account". These assertions exist to keep the organisation's name
 * coming from BRAND_NAME rather than from a literal.
 */
// Mirrors the shape of Strapi's env helper closely enough for this config:
// a callable with .int/.bool/.array attached.
const env = Object.assign(
  (key: string, fallback?: string) => process.env[key] ?? fallback,
  {
    int: (key: string, fallback?: number) =>
      process.env[key] === undefined ? fallback : Number(process.env[key]),
    bool: (key: string, fallback?: boolean) =>
      process.env[key] === undefined ? fallback : process.env[key] === 'true',
    array: (key: string, fallback?: string[]) =>
      process.env[key] === undefined ? fallback : String(process.env[key]).split(','),
  },
) as any

function loadPlugins() {
  jest.resetModules()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require('../plugins').default
  return config({ env })
}

describe('plugins config branding', () => {
  const original = process.env.BRAND_NAME

  afterEach(() => {
    if (original === undefined) delete process.env.BRAND_NAME
    else process.env.BRAND_NAME = original
  })

  it('names the API docs after the brand', () => {
    delete process.env.BRAND_NAME
    expect(loadPlugins().documentation.config.info.title).toBe('WPBrigade API')
  })

  it('publishes real contact details, not the Strapi placeholders', () => {
    delete process.env.BRAND_NAME
    const { info } = loadPlugins().documentation.config

    // The generated spec shipped TEAM / contact-email@something.io /
    // mywebsite.io / YOUR_TERMS_OF_SERVICE_URL to anyone reading the docs.
    const asText = JSON.stringify(info)
    expect(asText).not.toContain('YOUR_TERMS_OF_SERVICE_URL')
    expect(asText).not.toContain('contact-email@something.io')
    expect(asText).not.toContain('mywebsite.io')
    expect(asText).not.toMatch(/"name":\s*"TEAM"/)

    expect(info.contact.name).toBe('WPBrigade Support')
    expect(info.contact.email).toMatch(/@/)
    expect(info.termsOfService).toMatch(/\/terms-and-conditions$/)
  })

  it('declares the licence the project actually uses', () => {
    // The default said Apache 2.0; the repository is AGPL-3.0.
    expect(loadPlugins().documentation.config.info.license.name).toBe('AGPL-3.0-or-later')
  })

  it('sends the password reset as the brand, not the upstream project', () => {
    delete process.env.BRAND_NAME
    const reset = loadPlugins()['users-permissions'].config.advanced.email_reset_password

    expect(reset.from.name).toBe('WPBrigade Support')
    expect(reset.subject).toBe('Reset your password for WPBrigade')
    expect(reset.message).toContain('your WPBrigade account')
    expect(reset.message).toContain('The WPBrigade Team')
    expect(reset.message).not.toMatch(/certo/i)
  })

  it('leaves Strapi its own template placeholders', () => {
    const reset = loadPlugins()['users-permissions'].config.advanced.email_reset_password

    // Filled in by Strapi when it sends, so they must survive as literals.
    expect(reset.message).toContain('<%= URL %>')
    expect(reset.message).toContain('<%= TOKEN %>')
  })

  it('closes every paragraph it opens', () => {
    const reset = loadPlugins()['users-permissions'].config.advanced.email_reset_password

    expect((reset.message.match(/<p>/g) || []).length)
      .toBe((reset.message.match(/<\/p>/g) || []).length)
  })

  it('seeds a fresh database with self-registration disabled', () => {
    // The only way to get an account is to be issued a certificate, because
    // that is the path that also creates the profile. An account without one
    // can log in and then finds every page it can reach empty.
    //
    // Note what this does and does not prove. It is the value a *fresh*
    // database is seeded with; on one that has booted before, the plugin reads
    // its own store and this is ignored. That is why this assertion passed
    // while POST /api/auth/local/register carried on creating accounts. The
    // enforcement, and the test that covers it, are in
    // bootstrap/registration-lockdown.ts.
    expect(loadPlugins()['users-permissions'].config.advanced.allow_register).toBe(false)
  })

  it('follows BRAND_NAME when set', () => {
    process.env.BRAND_NAME = 'Acme Academy'
    const config = loadPlugins()

    expect(config.documentation.config.info.title).toBe('Acme Academy API')
    expect(config['users-permissions'].config.advanced.email_reset_password.subject)
      .toBe('Reset your password for Acme Academy')
  })
})
