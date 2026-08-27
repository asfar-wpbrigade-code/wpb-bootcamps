export interface BrandingConfig {
  name: string
  logoUrl: string
  primaryColor: string
  /**
   * LinkedIn company page id, so "Add to profile" links attribute the
   * certification to this organisation. Empty when unset - see
   * useLinkedInShare, which then falls back to matching by name.
   */
  linkedInOrganizationId: string
}

const DEFAULT_BRANDING: BrandingConfig = {
  name: 'WPBrigade',
  logoUrl: '/wpbrigade-logo.png',
  primaryColor: '#3458eb',
  linkedInOrganizationId: '',
}

function validColor(value: string | undefined): string {
  if (!value) {
    return DEFAULT_BRANDING.primaryColor
  }

  return /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_BRANDING.primaryColor
}

/**
 * LinkedIn company ids are numeric. Anything else (a page slug pasted by
 * mistake, a full URL) is dropped rather than sent, since a malformed id
 * silently attributes the certification to nothing.
 */
function validOrganizationId(value: string | undefined): string {
  const trimmed = value?.trim()

  if (!trimmed) {
    return DEFAULT_BRANDING.linkedInOrganizationId
  }

  return /^\d+$/.test(trimmed) ? trimmed : DEFAULT_BRANDING.linkedInOrganizationId
}

export function useBranding(): BrandingConfig {
  const config = useRuntimeConfig()
  const publicConfig = config.public as Record<string, unknown>

  return {
    name: typeof publicConfig.brandName === 'string' && publicConfig.brandName.trim()
      ? publicConfig.brandName.trim()
      : DEFAULT_BRANDING.name,
    logoUrl: typeof publicConfig.brandLogoUrl === 'string' && publicConfig.brandLogoUrl.trim()
      ? publicConfig.brandLogoUrl.trim()
      : DEFAULT_BRANDING.logoUrl,
    primaryColor: validColor(typeof publicConfig.brandPrimaryColor === 'string'
      ? publicConfig.brandPrimaryColor
      : undefined),
    linkedInOrganizationId: validOrganizationId(typeof publicConfig.brandLinkedInOrganizationId === 'string'
      ? publicConfig.brandLinkedInOrganizationId
      : undefined),
  }
}
