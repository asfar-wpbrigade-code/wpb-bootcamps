/**
 * revocation-list service
 */

import { factories } from '@strapi/strapi'
import { errors } from '@strapi/utils'
import crypto from 'crypto'
import { decodeStatusList, encodeStatusList, statusListHasIndex } from '../../../utils/status-list'
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
   * `encodedList` is a StatusList2021 bitstring (see utils/status-list.ts).
   * Lists written before that change hold a comma-separated list of indices
   * instead, and are still read correctly - the migration in
   * database/migrations converts them, but a list restored from an older
   * backup would arrive in the old format again.
   *
   * A list that decodes as neither propagates the error rather than answering
   * `false`: "the list is unreadable" is not "this credential is valid", and
   * verification.ts turns it into a failed check the caller can see.
   */
  async checkStatusInList(statusList: RevocationList, statusListIndex: number) {
    const encodedList = statusList.encodedList
    if (!encodedList) return false

    return statusListHasIndex(encodedList, statusListIndex)
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
          // A valid bitstring with nothing set, not an empty string: the list
          // is published for third parties to fetch from the moment the
          // issuer's first credential exists, and an empty `encodedList` is
          // not something a verifier can parse.
          encodedList: encodeStatusList([]),
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
   * The StatusList2021Credential for a list, as a third party would fetch it.
   *
   * A bitstring nobody can retrieve is no more verifiable than the old
   * comma-separated one: `credentialStatus.statusListCredential` has to name a
   * document a verifier can dereference, follow to `credentialSubject
   * .encodedList`, and check its own credential's index in. That used to be
   * the list's `urn:uuid:`, which resolves nowhere.
   *
   * Signed with the issuer's own key, through the same `generateProof()` that
   * signs credentials - an unsigned status list would let anyone who can
   * intercept the response un-revoke a credential by serving their own.
   *
   * @param {number|string} listId - The revocation list row id
   */
  async buildStatusListCredential(listId: number | string) {
    const baseUrl = strapi.config.get('server.url', 'http://localhost:1337')

    const statusList = await strapi.db.query('api::revocation-list.revocation-list').findOne({
      where: { id: listId },
      populate: ['issuer'],
    })

    if (!statusList) {
      throw new ApplicationError('Status list not found')
    }

    const listUrl = `${baseUrl}/api/status-lists/${statusList.id}`
    const issuerId = statusList.issuer?.id

    const payload: Record<string, any> = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/vc/status-list/2021/v1',
      ],
      id: listUrl,
      type: ['VerifiableCredential', 'StatusList2021Credential'],
      issuer: issuerId ? `${baseUrl}/api/profiles/${issuerId}` : listUrl,
      // `validFrom` is the VC 2.0 name; `issuanceDate` is what the
      // StatusList2021 context and every verifier built against it expects,
      // and it is what the credentials this list covers carry too.
      issuanceDate: new Date(statusList.lastUpdated || Date.now()).toISOString(),
      credentialSubject: {
        id: `${listUrl}#list`,
        type: 'StatusList2021',
        statusPurpose: statusList.statusPurpose || 'revocation',
        encodedList: statusList.encodedList,
      },
    }

    // A list belonging to a profile that has since been deleted is still
    // worth serving unsigned - the alternative is a 500 on a URL baked into
    // credentials already in the wild, which reads to a verifier as "the
    // issuer's infrastructure is gone" rather than "this key is missing".
    if (issuerId) {
      payload.proof = await strapi
        .service('api::credential.credential')
        .generateProof(issuerId, payload)
    }

    return payload
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
    // Reserved with a single atomic UPDATE ... RETURNING rather than a read
    // followed by a write. Read-then-write let concurrent issuances all see
    // the same `nextIndex` and claim the same slot - 11 credentials ended up
    // sharing slot 0, so revoking any one of them would have revoked all
    // eleven. The slot is a credential's identity in the StatusList2021
    // bitstring, so a duplicate is a correctness bug, not a cosmetic one.
    const connection = strapi.db.connection

    const updated = await connection("revocation_lists")
      .where({ id: statusListId })
      .increment("next_index", 1)
      .returning("next_index")

    const row = Array.isArray(updated) ? updated[0] : updated
    const nextIndex = typeof row === "object" && row !== null ? row.next_index : row

    if (nextIndex === undefined || nextIndex === null) {
      throw new ApplicationError('Status list not found')
    }

    // RETURNING gives the value after the increment; the slot reserved for
    // this caller is the one before it.
    return Number(nextIndex) - 1
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

      // Decode, add, re-encode. Reading the existing list first is what makes
      // this safe to run twice, and what stops a second revocation from
      // clearing the first: the bitstring is rewritten whole, so it has to be
      // built from the indices already in it.
      const indices = decodeStatusList(statusList.encodedList || '')

      if (!indices.includes(statusListIndex)) {
        indices.push(statusListIndex)
      }

      // Update the status list
      await strapi.db.query('api::revocation-list.revocation-list').update({
        where: { id: statusListId },
        data: {
          encodedList: encodeStatusList(indices),
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
