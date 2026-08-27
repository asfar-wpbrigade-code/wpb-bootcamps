import { darken, getBranding } from '../../../utils/branding'
import { escapeHtml, greetingName } from './format'

interface Achievement {
  name: string
}

interface Credential {
  credentialId: string
  id: number | string
}

interface User {
  username: string
  email: string
}

interface ExpirationWarningParams {
  achievement: Achievement
  credential: Credential
  frontendUrl: string
  user: User | null
  /** The recipient's name from their profile, for the greeting. */
  recipientName?: string | null
  daysLeft: number
  expirationDate: Date
}

/**
 * Builds the "your certificate is about to expire" email.
 *
 * Shares the issuance email's branding module and table-based, inline-styled
 * approach (see credential-issuance.ts for why), so the two read as coming
 * from the same organisation. The urgency palette is the one thing that
 * varies independently of the brand colour: red/amber signals a deadline in
 * a way a brand hue shouldn't be repurposed for.
 */
export const generateCredentialExpirationEmail = ({
  achievement,
  credential,
  frontendUrl,
  user,
  recipientName,
  daysLeft,
  expirationDate,
}: ExpirationWarningParams) => {
  const brand = getBranding()
  // Deliberately not falling back to `user.username`: for an auto-created
  // recipient account that's an email local-part with a timestamp appended,
  // and "Hi jane.doe1787654321," is worse than a plain "Hello,".
  const firstName = greetingName(recipientName)

  const formattedDate = expirationDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const urgency = daysLeft <= 1 ? 'expires today' : `expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
  const subject = `Your ${achievement.name} certificate ${urgency}`

  const credentialUrl = `${frontendUrl}/credentials/${encodeURIComponent(credential.credentialId)}`

  const text = `${firstName ? `Hi ${firstName},` : 'Hello,'}

Your "${achievement.name}" certificate ${urgency}.

Expiry date: ${formattedDate}
Certificate ID: ${credential.credentialId}

View and renew it here:
${credentialUrl}

If you think this is a mistake, or you have any questions, reply to this email or write to us at ${brand.contactEmail}

${brand.name}`

  const urgencyColor = daysLeft <= 1 ? '#b42318' : daysLeft <= 7 ? '#b54708' : '#8a6100'
  const urgencyBg = daysLeft <= 1 ? '#fef3f2' : daysLeft <= 7 ? '#fffaeb' : '#fefbe8'
  const urgencyBorder = daysLeft <= 1 ? '#fda29b' : daysLeft <= 7 ? '#fec84b' : '#fde272'

  const primary = brand.primaryColor
  const primaryDark = darken(primary, 0.35)
  const fontStack = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${subject}</title>
</head>
<body style="margin:0; padding:0; width:100%; background-color:#eef1f8; font-family:${fontStack};">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">Your ${achievement.name} certificate ${urgency} - renew it before ${formattedDate}.</div>

  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#eef1f8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <!--[if mso]>
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td>
        <![endif]-->
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%; max-width:600px; margin:0 auto; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 6px 24px rgba(23,32,74,0.10);">

          <!-- Brand header -->
          <tr>
            <td style="background-color:${primary}; background-image:linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%); padding:28px 32px;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="font-family:${fontStack}; font-size:20px; font-weight:700; letter-spacing:-0.3px; color:#ffffff;">${brand.name}</td>
                  <td align="right" style="font-family:${fontStack}; font-size:11px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:rgba(255,255,255,0.75);">Expiry Notice</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Urgency banner -->
          <tr>
            <td style="padding:32px 32px 0 32px;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${urgencyBg}; border:1px solid ${urgencyBorder}; border-radius:10px;">
                <tr>
                  <td width="46" valign="top" style="padding:18px 0 18px 18px; font-size:20px; line-height:1;">&#9888;&#65039;</td>
                  <td style="padding:18px 18px 18px 10px; font-family:${fontStack}; font-size:15px; line-height:1.55; color:${urgencyColor};">
                    <strong>Your ${achievement.name} certificate ${urgency}.</strong><br>
                    <span style="font-size:13px;">Expiry date: ${formattedDate}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px 0 32px;">
              <p style="margin:0 0 12px 0; font-family:${fontStack}; font-size:15px; line-height:1.65; color:#17204a;">${firstName ? `Hi ${escapeHtml(firstName)},` : 'Hello,'}</p>
              <p style="margin:0; font-family:${fontStack}; font-size:15px; line-height:1.65; color:#5a6480;">This is a reminder that one of your certificates is about to expire. If it still needs to be current, you can renew it from the certificate page.</p>
            </td>
          </tr>

          <!-- Certificate card -->
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f7f9fd; border:1px solid #e3e8f4; border-left:4px solid ${urgencyColor}; border-radius:10px;">
                <tr>
                  <td style="padding:22px 24px;">
                    <p style="margin:0 0 6px 0; font-family:${fontStack}; font-size:11px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:#8590ad;">Certificate</p>
                    <p style="margin:0 0 14px 0; font-family:${fontStack}; font-size:19px; line-height:1.35; font-weight:700; color:#17204a;">${escapeHtml(achievement.name)}</p>
                    <p style="margin:0; font-family:${fontStack}; font-size:13px; color:#5a6480;">
                      <strong style="color:#17204a;">Certificate ID</strong><br>
                      <span style="font-family:'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size:12px; color:#8590ad; word-break:break-all;">${credential.credentialId}</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Action -->
          <tr>
            <td align="center" style="padding:28px 32px 0 32px;">
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td align="center" style="background-color:${primary}; border-radius:8px;">
                    <a href="${credentialUrl}" target="_blank" style="display:inline-block; padding:15px 36px; font-family:${fontStack}; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:8px;">View &amp; renew certificate</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Support -->
          <tr>
            <td align="center" style="padding:28px 32px 32px 32px;">
              <p style="margin:0; font-family:${fontStack}; font-size:13px; line-height:1.6; color:#5a6480;">Think this is a mistake? Reply to this email, or write to us at<br>
                <a href="mailto:${brand.contactEmail}" style="color:${primary}; text-decoration:underline;">${brand.contactEmail}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px; background-color:#f7f9fd; border-top:1px solid #e3e8f4;">
              <p style="margin:0 0 6px 0; font-family:${fontStack}; font-size:12px; line-height:1.6; color:#8590ad; text-align:center;">You received this email because you hold a certificate issued by ${brand.name}.</p>
              <p style="margin:0; font-family:${fontStack}; font-size:12px; color:#8590ad; text-align:center;">&copy; ${new Date().getFullYear()} ${brand.name}. All rights reserved.</p>
            </td>
          </tr>

        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}
