import { useBranding } from './useBranding'

export interface AddToProfileParams {
  /** The certificate/achievement name, as it should read on the profile. */
  name: string
  /** The credential id, recorded by LinkedIn as the credential number. */
  certId: string
  /** Public URL where the certificate can be verified. */
  certUrl: string
  /** When the certificate was issued; omitted from the link if absent. */
  issueDate?: string | Date | null
}

/**
 * Builds LinkedIn "Add to profile" links for a certificate.
 *
 * This lived as four copy-pasted URLSearchParams blocks (the credential page,
 * the dashboard, the certificate card, and the issuance email), each with the
 * upstream project's own company id hardcoded - so every button credited
 * *their* organisation for certificates issued here, and fixing one copy left
 * three wrong. One builder, one configured identity.
 *
 * The organisation is identified by `organizationId` when configured, since a
 * numeric id links the certification straight to the company page. Failing
 * that it falls back to `organizationName`, which LinkedIn matches against
 * company names - not as reliable, but it puts the right name in front of the
 * recipient instead of the wrong company or none at all.
 */
export function useLinkedInShare() {
  const brand = useBranding()

  function buildAddToProfileUrl({ name, certId, certUrl, issueDate }: AddToProfileParams): string {
    const params = new URLSearchParams({
      startTask: 'CERTIFICATION_NAME',
      name,
    })

    if (brand.linkedInOrganizationId) {
      params.set('organizationId', brand.linkedInOrganizationId)
    }
    else {
      params.set('organizationName', brand.name)
    }

    const issued = issueDate ? new Date(issueDate) : null

    if (issued && !Number.isNaN(issued.getTime())) {
      params.set('issueYear', issued.getFullYear().toString())
      params.set('issueMonth', (issued.getMonth() + 1).toString())
    }

    if (certId) params.set('certId', certId)
    if (certUrl) params.set('certUrl', certUrl)

    return `https://www.linkedin.com/profile/add?${params.toString()}`
  }

  return { buildAddToProfileUrl }
}
