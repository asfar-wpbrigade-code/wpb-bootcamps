// src/backend/src/api/credential/templates/credential-issuance.ts

import { darken, getBranding } from '../../../utils/branding'
import { escapeHtml, greetingName } from './format'

interface Achievement {
  name: string
  description?: string
}

interface Credential {
  credentialId: string
  issuanceDate?: string | Date
}

interface User {
  username: string
  email: string
}

interface TemplateParams {
  achievement: Achievement
  credential: Credential
  frontendUrl: string
  user: User | null
  /** The recipient's name from their profile, for the greeting and the award line. */
  recipientName?: string | null
}

/**
 * Builds the "you've been awarded a credential" email.
 *
 * Written as table-based HTML with fully inlined styles, which is what email
 * clients actually support: Outlook's Word rendering engine ignores flexbox,
 * grid and most positioning, and Gmail strips <style> blocks. The `mso`
 * conditional comments give Outlook a fixed-width wrapper it can centre,
 * since it ignores `max-width`.
 *
 * No remote images are used for branding. The recipient's client would have
 * to fetch them from this instance's PUBLIC_URL, which is unreachable from
 * an inbox during local development and blocked by default in most clients
 * anyway - so the wordmark and the award seal are built from text and
 * background colours, which always render.
 */
export const generateCredentialIssuanceEmail = ({ achievement, credential, frontendUrl, user, recipientName }: TemplateParams) => {
  const brand = getBranding()
  const firstName = greetingName(recipientName)
  const awardedTo = recipientName?.trim() || null
  const credentialUrl = `${frontendUrl}/credentials/${credential.credentialId}`
  const subject = `Your ${achievement.name} certificate from ${brand.name}`

  const issuedOn = new Date(credential.issuanceDate ?? Date.now()).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const text = `${firstName ? `Congratulations, ${firstName}!` : 'Congratulations!'} You have been awarded the "${achievement.name}" certificate by ${brand.name}.

${awardedTo ? `Awarded to ${awardedTo}\n` : ''}Issued on ${issuedOn}
Certificate ID: ${credential.credentialId}

View and download your certificate:
${credentialUrl}

This certificate is cryptographically signed and follows the Open Badges 3.0 standard, so anyone can independently verify it at ${frontendUrl}/verify

Add it to your LinkedIn profile - here is our step-by-step guide: ${frontendUrl}/linkedin
${user
  ? `
YOUR ACCOUNT
An account has been created for you, so you can view every certificate you hold in one place.
Username: ${user.username}
Email: ${user.email}

Set your password here: ${frontendUrl}/forgot-password
`
  : ''}
Questions? Reply to this email or write to us at ${brand.contactEmail}

${brand.name}`

  // Identify the organisation by numeric id where configured, since that
  // links the certification straight to the company page. Without one, fall
  // back to `organizationName`, which LinkedIn matches against company
  // names - less reliable than an id, but it shows the recipient the right
  // organisation instead of the wrong one or none. Never hardcode an id:
  // the upstream project's own was in here, crediting them for every
  // certificate issued from this instance.
  const linkedInParams = [
    'startTask=CERTIFICATION_NAME',
    `name=${encodeURIComponent(achievement.name)}`,
    brand.linkedInOrganizationId
      ? `organizationId=${brand.linkedInOrganizationId}`
      : `organizationName=${encodeURIComponent(brand.name)}`,
    `issueYear=${new Date().getFullYear()}`,
    `issueMonth=${new Date().getMonth() + 1}`,
    `certId=${encodeURIComponent(credential.credentialId)}`,
    `certUrl=${encodeURIComponent(credentialUrl)}`,
  ].join('&')
  const linkedInUrl = `https://www.linkedin.com/profile/add?${linkedInParams}`

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
  <title>${achievement.name}</title>
</head>
<body style="margin:0; padding:0; width:100%; background-color:#eef1f8; font-family:${fontStack};">
  <!-- Preview text shown in the inbox list, before the message is opened -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">You've earned the ${achievement.name} certificate - view, download and share it.</div>

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
                  <td align="right" style="font-family:${fontStack}; font-size:11px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:rgba(255,255,255,0.75);">Verified Certificate</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Award seal + headline -->
          <tr>
            <td align="center" style="padding:40px 32px 8px 32px;">
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 20px auto;">
                <tr>
                  <td align="center" width="64" height="64" style="width:64px; height:64px; background-color:#fff6e0; border-radius:32px; font-size:30px; line-height:64px; text-align:center;">&#127942;</td>
                </tr>
              </table>
              <h1 style="margin:0 0 8px 0; font-family:${fontStack}; font-size:26px; line-height:1.25; font-weight:700; color:#17204a;">Congratulations${firstName ? `, ${escapeHtml(firstName)}` : ''}!</h1>
              <p style="margin:0; font-family:${fontStack}; font-size:15px; line-height:1.6; color:#5a6480;">You've been awarded a certificate by ${brand.name}.</p>
            </td>
          </tr>

          <!-- Certificate card -->
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f7f9fd; border:1px solid #e3e8f4; border-left:4px solid ${primary}; border-radius:10px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 6px 0; font-family:${fontStack}; font-size:11px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:#8590ad;">Certificate awarded</p>
                    <p style="margin:0 0 ${achievement.description ? '10px' : '18px'} 0; font-family:${fontStack}; font-size:20px; line-height:1.35; font-weight:700; color:#17204a;">${escapeHtml(achievement.name)}</p>
                    ${achievement.description
                      ? `<p style="margin:0 0 18px 0; font-family:${fontStack}; font-size:14px; line-height:1.6; color:#5a6480;">${escapeHtml(achievement.description)}</p>`
                      : ''}
                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid #e3e8f4;">
                      ${awardedTo
                        ? `<tr>
                        <td style="padding-top:16px; font-family:${fontStack}; font-size:13px; color:#5a6480;">
                          <strong style="color:#17204a;">Awarded to</strong>&nbsp; ${escapeHtml(awardedTo)}
                        </td>
                      </tr>`
                        : ''}
                      <tr>
                        <td style="padding-top:${awardedTo ? '8px' : '16px'}; font-family:${fontStack}; font-size:13px; color:#5a6480;">
                          <strong style="color:#17204a;">Issued</strong>&nbsp; ${issuedOn}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:8px; font-family:${fontStack}; font-size:13px; color:#5a6480;">
                          <strong style="color:#17204a;">Certificate ID</strong><br>
                          <span style="font-family:'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size:12px; color:#8590ad; word-break:break-all;">${credential.credentialId}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Primary action -->
          <tr>
            <td align="center" style="padding:28px 32px 8px 32px;">
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td align="center" style="background-color:${primary}; border-radius:8px;">
                    <a href="${credentialUrl}" target="_blank" style="display:inline-block; padding:15px 36px; font-family:${fontStack}; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:8px;">View your certificate</a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0; font-family:${fontStack}; font-size:13px; line-height:1.6; color:#8590ad;">Download it as an image, get a QR code, or share the link.</p>
            </td>
          </tr>

          <!-- Verifiability note -->
          <tr>
            <td style="padding:28px 32px 0 32px;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f0fdf5; border:1px solid #c8ecd6; border-radius:10px;">
                <tr>
                  <td width="44" valign="top" style="padding:18px 0 18px 18px; font-size:20px; line-height:1;">&#128274;</td>
                  <td style="padding:18px 18px 18px 10px; font-family:${fontStack}; font-size:13px; line-height:1.6; color:#256b45;">
                    <strong style="color:#14532d;">This certificate is tamper-proof.</strong> It's cryptographically signed and follows the Open Badges 3.0 standard, so anyone can
                    <a href="${frontendUrl}/verify" target="_blank" style="color:#14532d; text-decoration:underline;">verify it independently</a> - no need to take your word for it.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- LinkedIn -->
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f7f9fd; border:1px solid #e3e8f4; border-radius:10px;">
                <tr>
                  <td align="center" style="padding:22px;">
                    <p style="margin:0 0 4px 0; font-family:${fontStack}; font-size:15px; font-weight:700; color:#17204a;">Show it off on LinkedIn</p>
                    <p style="margin:0 0 16px 0; font-family:${fontStack}; font-size:13px; line-height:1.6; color:#5a6480;">Add it to your profile's certifications in a couple of clicks.</p>
                    <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="background-color:#0a66c2; border-radius:8px;">
                          <a href="${linkedInUrl}" target="_blank" style="display:inline-block; padding:12px 26px; font-family:${fontStack}; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">Add to LinkedIn</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:14px 0 0 0; font-family:${fontStack}; font-size:12px; color:#8590ad;">Prefer to do it manually? <a href="${frontendUrl}/linkedin" target="_blank" style="color:${primary}; text-decoration:underline;">Follow our guide</a>.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${user
            ? `
          <!-- Account -->
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e3e8f4; border-radius:10px;">
                <tr>
                  <td style="padding:22px;">
                    <p style="margin:0 0 4px 0; font-family:${fontStack}; font-size:15px; font-weight:700; color:#17204a;">Your account is ready</p>
                    <p style="margin:0 0 16px 0; font-family:${fontStack}; font-size:13px; line-height:1.6; color:#5a6480;">We've set up an account so you can find every certificate you hold in one place.</p>
                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f7f9fd; border-radius:8px;">
                      <tr>
                        <td style="padding:14px 16px; font-family:${fontStack}; font-size:13px; line-height:1.8; color:#5a6480;">
                          <strong style="color:#17204a;">Username</strong>&nbsp; ${escapeHtml(user.username)}<br>
                          <strong style="color:#17204a;">Email</strong>&nbsp; ${escapeHtml(user.email)}
                        </td>
                      </tr>
                    </table>
                    <p style="margin:16px 0 0 0; font-family:${fontStack}; font-size:13px; line-height:1.6; color:#5a6480;">Choose a password to sign in for the first time:</p>
                    <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:14px 0 0 0;">
                      <tr>
                        <td align="center" style="background-color:#ffffff; border:1.5px solid ${primary}; border-radius:8px;">
                          <a href="${frontendUrl}/forgot-password" target="_blank" style="display:inline-block; padding:11px 24px; font-family:${fontStack}; font-size:14px; font-weight:600; color:${primary}; text-decoration:none; border-radius:8px;">Set your password</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          `
            : ''}

          <!-- Support -->
          <tr>
            <td align="center" style="padding:28px 32px 32px 32px;">
              <p style="margin:0; font-family:${fontStack}; font-size:13px; line-height:1.6; color:#5a6480;">Questions? Just reply to this email, or write to us at<br>
                <a href="mailto:${brand.contactEmail}" style="color:${primary}; text-decoration:underline;">${brand.contactEmail}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px; background-color:#f7f9fd; border-top:1px solid #e3e8f4;">
              <p style="margin:0 0 6px 0; font-family:${fontStack}; font-size:12px; line-height:1.6; color:#8590ad; text-align:center;">You received this email because ${brand.name} issued you a certificate.</p>
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
