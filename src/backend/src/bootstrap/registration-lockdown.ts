/**
 * Keeps self-registration switched off, on every boot.
 *
 * `allow_register: false` in config/plugins.ts is not enough, and looks like
 * it is. The users-permissions plugin seeds its `advanced` settings into the
 * plugin store the first time a database boots, and reads the *store* from
 * then on - so on any database that has already run, the stored `true` wins
 * and the config edit is silently ignored. This is the same trap
 * bootstrap/email-templates-setup.ts documents for the email templates, and
 * it fails the same way: nothing errors, the config reads correctly, and the
 * endpoint carries on creating accounts.
 *
 * It is worth being emphatic about why that matters here. Issuance creates the
 * account and the profile together (api/credential/services/credential.ts), so
 * an account made any other way has no profile - and `profile.me` resolves the
 * profile by email against a *published* row, returning 404 when there is
 * none. The result is a login that works and a dashboard, profile page and
 * certificate list that are all empty, with nothing to explain why. See item
 * 42 in docs/known-issues-and-dev-notes.md.
 *
 * Enforced on every boot rather than once, because this is a security setting
 * with a UI: it can be turned back on in Settings -> Users & Permissions ->
 * Advanced settings, by accident as easily as on purpose. If someone decides
 * self-registration should exist, the profile has to be created in the same
 * request - and this file is where they will find out that turning the toggle
 * on is not sufficient either.
 *
 * The store is only written when the value actually differs, so a normal
 * restart is silent and does not touch the row.
 */

export async function enforceRegistrationLockdown(strapi: any): Promise<void> {
  try {
    const pluginStore = strapi.store({ type: 'plugin', name: 'users-permissions' });
    const advanced = await pluginStore.get({ key: 'advanced' });

    if (!advanced) {
      // No stored settings yet: this is a first boot, the plugin has not seeded
      // them, and config/plugins.ts is about to supply allow_register: false
      // on its own.
      return;
    }

    if (advanced.allow_register === false) return;

    await pluginStore.set({ key: 'advanced', value: { ...advanced, allow_register: false } });

    strapi.log.warn(
      '[registration] Self-registration was enabled in the database and has been switched off. '
      + 'An account comes from being issued a certificate, which is what also creates the profile every '
      + 'authenticated page reads; an account without one can log in and then finds every page empty.'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    strapi.log.error(`[registration] Could not verify that self-registration is disabled: ${message}`);
  }
}
