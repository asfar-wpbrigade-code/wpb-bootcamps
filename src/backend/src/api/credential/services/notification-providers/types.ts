/**
 * A notification provider is anything that can tell a recipient they've
 * been issued a credential. The default (and only, for now) implementation
 * sends email via Strapi's own email plugin - this interface exists so
 * alternate providers (SES, Mailgun, Slack, ...) can be added later without
 * touching credential.ts's issuance logic.
 */

export interface NotificationPayload {
  to: string
  achievement: { name: string; description?: string }
  credential: { credentialId: string; id: number | string }
  frontendUrl: string
  user: { username: string; email: string } | null
  /**
   * The recipient's own name, from their profile - not `user.username`,
   * which for an auto-created account is an email local-part with a
   * timestamp stuck on the end. Optional because a profile can exist
   * without one, in which case the templates greet impersonally.
   */
  recipientName?: string | null
}

export interface ExpirationWarningPayload {
  to: string
  achievement: { name: string }
  credential: { credentialId: string; id: number | string }
  frontendUrl: string
  user: { username: string; email: string } | null
  /** See NotificationPayload.recipientName. */
  recipientName?: string | null
  daysLeft: number
  expirationDate: Date
}

export interface NotificationProvider {
  sendCredentialIssued(payload: NotificationPayload): Promise<void>
  sendExpirationWarning(payload: ExpirationWarningPayload): Promise<void>
}
