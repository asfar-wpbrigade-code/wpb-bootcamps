import { generateCredentialIssuanceEmail } from '../../templates/credential-issuance'
import { generateCredentialExpirationEmail } from '../../templates/credential-expiration'
import type { ExpirationWarningPayload, NotificationPayload, NotificationProvider } from './types'

/**
 * Default notification provider: sends via Strapi's own email plugin
 * (nodemailer under the hood, see config/plugins.ts), using the existing
 * credential-issuance email template. This is exactly what credential.ts
 * did inline before this provider existed - no behavior change.
 */
export function createStrapiEmailProvider(strapi: any): NotificationProvider {
  return {
    async sendCredentialIssued({ to, achievement, credential, frontendUrl, user, recipientName }: NotificationPayload) {
      const emailTemplate = generateCredentialIssuanceEmail({ achievement, credential, frontendUrl, user, recipientName })

      await strapi.plugins['email'].services.email.send({
        to,
        subject: emailTemplate.subject,
        text: emailTemplate.text,
        html: emailTemplate.html,
      })
    },

    async sendExpirationWarning({ to, achievement, credential, frontendUrl, user, recipientName, daysLeft, expirationDate }: ExpirationWarningPayload) {
      const emailTemplate = generateCredentialExpirationEmail({ achievement, credential, frontendUrl, user, recipientName, daysLeft, expirationDate })

      await strapi.plugins['email'].services.email.send({
        to,
        subject: emailTemplate.subject,
        text: emailTemplate.text,
        html: emailTemplate.html,
      })
    },
  }
}
