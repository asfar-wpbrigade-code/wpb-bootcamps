/**
 * Certificate service for generating visual certificates
 */

import { generateCertificateSvg } from '../../../utils/certificate-template'

/** Relations the certificate template needs to render. */
const CERTIFICATE_POPULATE = {
  achievement: { populate: ['image'] },
  issuer: { populate: ['image'] },
  recipient: true,
} as any

export default ({ strapi }) => ({
  /**
   * Find the credential a certificate is being requested for.
   *
   * Accepts any of the three identifiers this system hands out, because
   * callers legitimately hold different ones:
   *
   * - `urn:uuid:...` - the credentialId in the Open Badges payload, in
   *   verification links and in the SDK. This is what the frontend has, and
   *   what it was passing: `entityService.findOne` fed it straight to a
   *   `WHERE id = $1` and Postgres answered "invalid input syntax for type
   *   integer", which reached the browser as a raw SQL string. The credential
   *   page treats that as a broken image and silently falls back to the
   *   achievement artwork - which is why the generated certificate never
   *   appeared anywhere in the app.
   * - `documentId` - Strapi 5's stable document identifier.
   * - the numeric row id - what the endpoint used to accept, and only that.
   *
   * @param {number|string} identifier - Any of the three
   */
  async findCredentialForCertificate(identifier: number | string) {
    const query = strapi.db.query('api::credential.credential')
    const asString = String(identifier)

    const byCredentialId = await query.findOne({
      where: { credentialId: asString, publishedAt: { $notNull: true } },
      populate: CERTIFICATE_POPULATE,
    })
    if (byCredentialId) return byCredentialId

    const byDocumentId = await query.findOne({
      where: { documentId: asString, publishedAt: { $notNull: true } },
      populate: CERTIFICATE_POPULATE,
    })
    if (byDocumentId) return byDocumentId

    // Only try the numeric column when the value is actually numeric -
    // handing Postgres a urn is what produced the SQL error above.
    if (/^\d+$/.test(asString)) {
      return query.findOne({
        where: { id: Number(asString), publishedAt: { $notNull: true } },
        populate: CERTIFICATE_POPULATE,
      })
    }

    return null
  },

  /**
   * Generate a certificate for a credential
   * @param {number|string} credentialId - The ID of the credential
   * @returns {string} The SVG certificate
   */
  async generateCertificate(credentialId: number | string): Promise<string> {
    try {
      const credential = await this.findCredentialForCertificate(credentialId)

      if (!credential) {
        throw new Error('Credential not found')
      }

      // Get required data
      const recipientName = credential.recipient?.name || 'Recipient'
      const achievementName = credential.achievement?.name || credential.name || 'Achievement'
      const issuerName = credential.issuer?.name || 'Issuer'
      const issueDate = credential.issuanceDate
      
      // Determine badge image URL
      const baseUrl = strapi.config.get('server.url', 'http://localhost:1337')
      let badgeImageUrl = null

      if (credential.achievement?.image?.url) {
        badgeImageUrl = credential.achievement.image.url.startsWith('http')
          ? credential.achievement.image.url
          : `${baseUrl}${credential.achievement.image.url}`
      }

      // The certificate's QR code links here - same self-hosting-aware
      // frontend.url config credential.ts already uses for notification
      // emails, not a hardcoded production URL.
      const frontendUrl = strapi.config.get('frontend.url', 'http://localhost:3000')
      const verifyUrl = `${frontendUrl}/credentials/${encodeURIComponent(credential.credentialId)}`

      // Generate the certificate SVG
      return await generateCertificateSvg({
        recipientName,
        achievementName,
        issuerName,
        issueDate,
        credentialId: credential.credentialId,
        badgeImageUrl,
        verifyUrl
      })
    } catch (error) {
      console.error('Error generating certificate:', error)
      throw error
    }
  },

  /**
   * Generate a data URI for the certificate SVG
   * @param {number|string} credentialId - The ID of the credential
   * @returns {string} The data URI
   */
  async generateCertificateDataUri(credentialId: number | string): Promise<string> {
    try {
      const svg = await this.generateCertificate(credentialId)
      // Convert to a data URI
      const svgBase64 = Buffer.from(svg).toString('base64')
      return `data:image/svg+xml;base64,${svgBase64}`
    } catch (error) {
      console.error('Error generating certificate data URI:', error)
      throw error
    }
  }
}) 