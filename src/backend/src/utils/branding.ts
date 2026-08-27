/**
 * Branding for anything the backend sends out on the organisation's behalf -
 * currently the credential-issuance and expiration-warning emails.
 *
 * Deliberately mirrors the frontend's `composables/useBranding.ts`: same
 * fields, same WPBrigade defaults, same "fall back rather than render
 * something broken" behaviour, so a self-hoster configures one concept in
 * two places rather than learning two. The env names drop the frontend's
 * `NUXT_PUBLIC_` prefix, which only exists to expose values to the browser.
 */

export interface Branding {
  /** Organisation name, used in the wordmark, copy and footer. */
  name: string
  /** Hex colour driving the header, buttons and accents. */
  primaryColor: string
  /** Where recipients are told to write with questions. */
  contactEmail: string
  /**
   * LinkedIn company page id, used by the "Add to profile" link so the
   * certification is attributed to the right organisation. Null when unset -
   * the link then omits the attribution rather than crediting someone else.
   */
  linkedInOrganizationId: string | null
}

const DEFAULT_BRANDING = {
  name: 'WPBrigade',
  primaryColor: '#3458eb',
  contactEmail: 'info@autops.online',
} as const

/** Guards against a malformed value reaching an inline `style` attribute. */
function validColor(value: string | undefined): string {
  if (!value) return DEFAULT_BRANDING.primaryColor

  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : DEFAULT_BRANDING.primaryColor
}

function nonEmpty(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback
}

export function getBranding(): Branding {
  const linkedInOrganizationId = process.env.LINKEDIN_ORGANIZATION_ID?.trim()

  return {
    name: nonEmpty(process.env.BRAND_NAME, DEFAULT_BRANDING.name),
    primaryColor: validColor(process.env.BRAND_PRIMARY_COLOR),
    contactEmail: nonEmpty(process.env.BRAND_CONTACT_EMAIL, DEFAULT_BRANDING.contactEmail),
    linkedInOrganizationId: linkedInOrganizationId && /^\d+$/.test(linkedInOrganizationId)
      ? linkedInOrganizationId
      : null,
  }
}

/**
 * Darkens a hex colour by `amount` (0-1), for the header gradient's second
 * stop and for button borders - so one configured colour yields a palette
 * instead of needing three env vars that could drift out of tune.
 */
export function darken(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(clean.slice(i, i + 2), 16)
    return Math.max(0, Math.round(value * (1 - amount)))
  })

  return `#${channels.map(c => c.toString(16).padStart(2, '0')).join('')}`
}
