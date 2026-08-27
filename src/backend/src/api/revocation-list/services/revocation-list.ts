/**
 * revocation-list service
 */

import { factories } from '@strapi/strapi'
import { errors } from '@strapi/utils'
import crypto from 'crypto'
const { ApplicationError } = errors

interface RevocationList {
  id: any
  issuer: any
  statusListCredential: string
  statusPurpose: string
  encodedList: string
  lastUpdated: Date
}

// Exported separately (not just inline in createCoreService below) so unit
// tests can call it directly against a lightweight fake `strapi` without
// going through Strapi's core service factory, which needs a real app
// instance (strapi.contentType(), etc.) to construct the base CRUD methods.
export const revocationListExtension = ({ strapi }: { strapi: any }) => ({
  /**
   * Check if a credential has been revoked in any revocation list
   */
  async checkCredentialStatus(credentialId: string) {
    try {
      // Find the credential to get the issuer
      const credential = await strapi.db.query('api::credential.credential').findOne({
        where: { credentialId },
        populate: ['issuer']
      })
      
      if (!credential) {
        throw new ApplicationError('Credential not found')
      }
      
      // If the credential is directly marked as revoked
      if (credential.revoked) {
        return {
          revoked: true,
          reason: credential.revocationReason || 'Credential has been revoked'
        }
      }
      
      return { revoked: false }
    } catch (error) {
      console.error('Error checking credential status:', error)
      throw new ApplicationError(`Error checking credential status: ${error.message}`)
    }
  },
  
  /**
   * Check if a credential is revoked in a specific status list.
   *
   * Known simplification: encodedList is a comma-separated list of revoked
   * indices, not a real StatusList2021 GZIP+base64 bitstring. Fine as an
   * internal representation for a single-instance deployment; a real
   * bitstring encoding (for publishing a standards-compliant status list
   * credential externally) is a separate, larger task.
   */
  async checkStatusInList(statusList: RevocationList, statusListIndex: number) {
    try {
      const encodedList = statusList.encodedList
      if (!encodedList) return false

      const revokedIndices = encodedList.split(',').map(i => parseInt(i.trim(), 10))
      return revokedIndices.includes(statusListIndex)
    } catch (error) {
      console.error('Error checking status in list:', error)
      return false
    }
  },

  /**
   * Create a new status list credential for an issuer
   */
  async createStatusListCredential(issuerId: number | string, purpose = 'revocation') {
    try {
      // Find the issuer
      const issuer = await strapi.entityService.findOne('api::profile.profile', issuerId)

      if (!issuer) {
        throw new ApplicationError('Issuer not found')
      }

      // Create a unique ID for the status list credential
      const statusListId = `urn:uuid:${crypto.randomUUID()}`

      // Create an empty status list.
      //
      // Uses the low-level strapi.db.query() API rather than
      // strapi.entityService.create(): `revocation-list` has
      // draftAndPublish enabled, and entityService.create() with
      // `publishedAt` set creates a draft row plus a separate published
      // counterpart whose id can still briefly fail Strapi 5's
      // relation-existence check if referenced immediately afterward - as
      // this list's id is, moments later, by the credential this method
      // was called to support issuing. db.query().create() inserts a
      // single, immediately-stable row instead - safe here since
      // revocation-list has no component fields (unlike credential, where
      // the `proof` component needs entityService's handling).
      const statusList = await strapi.db.query('api::revocation-list.revocation-list').create({
        data: {
          issuer: issuerId,
          statusListCredential: statusListId,
          statusPurpose: purpose,
          encodedList: '', // Empty list to start
          nextIndex: 0,
          lastUpdated: new Date(),
          publishedAt: new Date()
        }
      })

      return statusList
    } catch (error) {
      console.error('Error creating status list credential:', error)
      throw new ApplicationError(`Error creating status list credential: ${error.message}`)
    }
  },

  /**
   * Find the issuer's active revocation list, creating one if this is
   * their first credential.
   */
  async getOrCreateActiveListForIssuer(issuerId: number | string) {
    // db.query, not entityService.findMany - see the note above
    // createStatusListCredential on why this content type is managed
    // through the low-level API throughout, avoiding any
    // draft/publish-status ambiguity in whether a freshly-created row (with
    // no draft counterpart at all) matches a default-status lookup.
    const existing = await strapi.db.query('api::revocation-list.revocation-list').findMany({
      where: { issuer: issuerId, statusPurpose: 'revocation' },
    })
    if (existing && existing.length > 0) return existing[0]
    return this.createStatusListCredential(issuerId)
  },

  /**
   * Reserve the next available index in a status list for a new credential.
   */
  async assignNextIndex(statusListId: number | string) {
    const statusList = await strapi.db.query('api::revocation-list.revocation-list').findOne({
      where: { id: statusListId },
    })
    if (!statusList) {
      throw new ApplicationError('Status list not found')
    }

    const index = statusList.nextIndex ?? 0
    await strapi.db.query('api::revocation-list.revocation-list').update({
      where: { id: statusListId },
      data: { nextIndex: index + 1 },
    })

    return index
  },

  /**
   * Update a status list to revoke a credential
   */
  async revokeCredentialInStatusList(statusListId: number | string, statusListIndex: number) {
    try {
      // Find the status list
      const statusList = await strapi.db.query('api::revocation-list.revocation-list').findOne({
        where: { id: statusListId },
      })

      if (!statusList) {
        throw new ApplicationError('Status list not found')
      }

      // Update the encoded list to include the new index
      const encodedList = statusList.encodedList || ''
      const indices = encodedList ? encodedList.split(',').map(i => parseInt(i.trim())) : []

      if (!indices.includes(statusListIndex)) {
        indices.push(statusListIndex)
      }

      // Update the status list
      await strapi.db.query('api::revocation-list.revocation-list').update({
        where: { id: statusListId },
        data: {
          encodedList: indices.join(','),
          lastUpdated: new Date()
        }
      })

      return true
    } catch (error) {
      console.error('Error revoking credential in status list:', error)
      throw new ApplicationError(`Error revoking credential in status list: ${error.message}`)
    }
  }
})

export default factories.createCoreService('api::revocation-list.revocation-list', revocationListExtension)
