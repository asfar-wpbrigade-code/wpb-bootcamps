/**
 * Repairs the users-permissions email templates on boot.
 *
 * Two factory defaults in Strapi's `users-permissions` plugin store break
 * password resets on any real SMTP setup, and neither can be fixed from
 * config/plugins.ts:
 *
 * 1. `email.reset_password.options.from` is `no-reply@strapi.io`. That
 *    explicit `from` overrides the email plugin's `settings.defaultFrom`, so
 *    every reset mail is sent claiming to be strapi.io. Any SMTP provider
 *    that enforces sender ownership rejects it outright - Hostinger answers
 *    `553 5.7.1 Sender address rejected: not owned by user`, which surfaces
 *    to the user as a bare "Internal Server Error" on /forgot-password.
 *
 * 2. `advanced.email_reset_password` (the "reset password page" URL) is
 *    null, so `<%= URL %>` in the template renders empty and the link in the
 *    mail goes nowhere - a second failure waiting behind the first.
 *
 * The `users-permissions` config block in config/plugins.ts looks like it
 * covers this, but the plugin only seeds its store from config when the keys
 * are *absent*; on any database that has booted once, the stored values win
 * and config edits are silently ignored. Hence fixing it here, against the
 * store itself.
 *
 * Only the known-broken defaults are rewritten. A sender someone has
 * deliberately set (in Settings -> Users & Permissions -> Email templates)
 * is left alone, so this repairs a broken install without overriding an
 * operator's own choice on every restart.
 */

/** The sender Strapi ships with, and the only one we consider ours to replace. */
const STRAPI_DEFAULT_SENDER = 'no-reply@strapi.io';

export async function setupEmailTemplates(strapi: any): Promise<void> {
  try {
    const fromAddress = process.env.SMTP_FROM;

    if (!fromAddress) {
      strapi.log.warn('[email-templates] SMTP_FROM is not set - leaving the reset-password sender as it is. Password reset emails will be rejected by any SMTP provider that enforces sender ownership.');
      return;
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Credentials';
    const replyTo = process.env.SMTP_REPLY_TO || fromAddress;
    const pluginStore = strapi.store({ type: 'plugin', name: 'users-permissions' });

    await repairSender(strapi, pluginStore, { fromAddress, fromName, replyTo });
    await repairResetPasswordUrl(strapi, pluginStore);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    strapi.log.error(`[email-templates] Could not check the email templates: ${message}`);
  }
}

/**
 * Point both templates' `from`/`response_email` at the configured SMTP
 * identity, but only where they still hold Strapi's default sender.
 */
async function repairSender(
  strapi: any,
  pluginStore: any,
  { fromAddress, fromName, replyTo }: { fromAddress: string, fromName: string, replyTo: string },
): Promise<void> {
  const templates = await pluginStore.get({ key: 'email' });

  if (!templates) return;

  const repaired: string[] = [];

  for (const templateKey of Object.keys(templates)) {
    const options = templates[templateKey]?.options;

    if (!options) continue;

    const currentSender = options.from?.email;

    // Rewrite only Strapi's own default, or an address this function set on
    // an earlier boot (so SMTP_FROM/SMTP_FROM_NAME stay authoritative for it).
    // A third-party address was chosen on purpose - leave it, name included.
    const isOursToSet = !currentSender
      || currentSender === STRAPI_DEFAULT_SENDER
      || currentSender === fromAddress;

    if (!isOursToSet) continue;
    if (currentSender === fromAddress && options.from?.name === fromName) continue;

    options.from = { name: fromName, email: fromAddress };

    if (!options.response_email || options.response_email === STRAPI_DEFAULT_SENDER) {
      options.response_email = replyTo;
    }

    repaired.push(templateKey);
  }

  if (repaired.length === 0) return;

  await pluginStore.set({ key: 'email', value: templates });
  strapi.log.info(`[email-templates] Sender for ${repaired.join(', ')} was still Strapi's default (${STRAPI_DEFAULT_SENDER}) - set to ${fromAddress}.`);
}

/**
 * Give `<%= URL %>` somewhere to point: the frontend's reset-password page,
 * which reads the `code` query parameter the template appends.
 */
async function repairResetPasswordUrl(strapi: any, pluginStore: any): Promise<void> {
  const advanced = await pluginStore.get({ key: 'advanced' });

  if (!advanced || advanced.email_reset_password) return;

  const frontendUrl = strapi.config.get('frontend.url', 'http://localhost:3000');
  const resetUrl = `${frontendUrl.replace(/\/+$/, '')}/reset-password`;

  await pluginStore.set({ key: 'advanced', value: { ...advanced, email_reset_password: resetUrl } });
  strapi.log.info(`[email-templates] Reset-password page URL was unset - set to ${resetUrl}.`);
}
