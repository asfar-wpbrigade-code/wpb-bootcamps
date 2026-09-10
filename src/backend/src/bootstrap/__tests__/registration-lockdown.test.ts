import { enforceRegistrationLockdown } from '../registration-lockdown'

function makeFakeStrapi(stored: Record<string, any> | null) {
  const warn = jest.fn()
  const error = jest.fn()
  const set = jest.fn(async (_payload: { key: string, value: Record<string, any> }) => {})

  return {
    strapi: {
      log: { warn, error },
      store: (options: { type: string, name: string }) => {
        if (options.type !== 'plugin' || options.name !== 'users-permissions') {
          throw new Error(`Unexpected store: ${JSON.stringify(options)}`)
        }
        return {
          get: async ({ key }: { key: string }) => (key === 'advanced' ? stored : null),
          set,
        }
      },
    },
    warn,
    error,
    set,
  }
}

const STORED_DEFAULTS = {
  unique_email: true,
  allow_register: true,
  email_confirmation: false,
  default_role: 'authenticated',
}

describe('enforceRegistrationLockdown', () => {
  it('switches registration off when the database has it on', async () => {
    // The case that matters: config/plugins.ts says false, the store says
    // true, and the store is what the register endpoint reads. Asserting the
    // config value alone passes while the endpoint carries on creating
    // accounts - which is exactly what happened.
    const { strapi, set, warn } = makeFakeStrapi({ ...STORED_DEFAULTS })

    await enforceRegistrationLockdown(strapi)

    expect(set).toHaveBeenCalledWith({
      key: 'advanced',
      value: { ...STORED_DEFAULTS, allow_register: false },
    })
    expect(warn).toHaveBeenCalled()
  })

  it('leaves the rest of the advanced settings alone', async () => {
    const stored = { ...STORED_DEFAULTS, email_reset_password: 'https://example.test/reset' }
    const { strapi, set } = makeFakeStrapi(stored)

    await enforceRegistrationLockdown(strapi)

    expect(set.mock.calls[0][0].value.email_reset_password).toBe('https://example.test/reset')
  })

  it('writes nothing when it is already off', async () => {
    // Every boot calls this, so a normal restart must not touch the row.
    const { strapi, set, warn } = makeFakeStrapi({ ...STORED_DEFAULTS, allow_register: false })

    await enforceRegistrationLockdown(strapi)

    expect(set).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('does nothing on a first boot, before the plugin has seeded its store', async () => {
    // There is nothing to correct yet, and config/plugins.ts supplies the
    // right value when the plugin seeds it.
    const { strapi, set } = makeFakeStrapi(null)

    await enforceRegistrationLockdown(strapi)

    expect(set).not.toHaveBeenCalled()
  })

  it('logs and carries on if the store cannot be read', async () => {
    // A boot must not fail over this check.
    const error = jest.fn()
    const strapi = {
      log: { warn: jest.fn(), error },
      store: () => ({
        get: async () => { throw new Error('store unavailable') },
        set: async () => {},
      }),
    }

    await expect(enforceRegistrationLockdown(strapi)).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
  })
})
