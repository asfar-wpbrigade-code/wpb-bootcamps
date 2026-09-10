/**
 * revocation-list controller
 */

import { factories } from '@strapi/strapi'

interface Credential {
  id: any
  credentialId: string
  revoked: boolean
  revocationReason?: string
  issuer: {
    id: any
  }
  statusList?: {
    id: any
  }
  statusListIndex?: number
}

interface RevocationList {
  id: any
  encodedList: string
  statusPurpose: string
  lastUpdated: Date
}

export default factories.createCoreController('api::revocation-list.revocation-list', ({ strapi }) => ({
  /**
   * GET /api/status-lists/:id - the StatusList2021Credential itself.
   *
   * Public, because this is the URL a third-party verifier finds in a
   * credential's `credentialStatus` and follows. See routes/status-list.ts.
   */
  async statusListCredential(ctx) {
    const { id } = ctx.params

    try {
      const credential = await strapi
        .service('api::revocation-list.revocation-list')
        .buildStatusListCredential(id)

      // A status list changes only when something is revoked, and a verifier
      // may fetch it once per credential it checks. `no-cache` rather than a
      // max-age: a stale list is a credential that reads as valid after it
      // was revoked, which is the one answer this endpoint must never give.
      ctx.set('Cache-Control', 'no-cache')

      // Assigned to ctx.body, then typed - not returned. Returning a value
      // from a Strapi controller lets its own response pipeline set the type,
      // which overwrote an earlier ctx.set('Content-Type', ...) back to
      // application/json. Setting ctx.type after ctx.body is what sticks, and
      // this document is JSON-LD: the @context is what tells a verifier how to
      // read it.
      ctx.body = credential
      ctx.type = 'application/ld+json; charset=utf-8'
    } catch (err) {
      if (err.message === 'Status list not found') {
        return ctx.notFound('Status list not found')
      }
      strapi.log.error(`[status-list] Could not build status list ${id}: ${err.message}`)
      return ctx.internalServerError('Error building status list credential')
    }
  },

  // Custom controller methods for revocation list
  async checkStatus(ctx) {
    try {
      const { credentialId } = ctx.params
      
      if (!credentialId) {
        return ctx.badRequest('Credential ID is required')
      }
      
      // Find the credential
      const credential = await strapi.db.query('api::credential.credential').findOne({
        where: { credentialId },
        populate: ['issuer', 'statusList']
      }) as Credential
      
      if (!credential) {
        return ctx.notFound('Credential not found')
      }
      
      // If revoked directly, return that status
      if (credential.revoked) {
        return {
          revoked: true,
          reason: credential.revocationReason || 'No reason provided'
        }
      }
      
      // Otherwise consult the credential's own slot in its issuer's status
      // list. This used to read `list.revokedCredentials[credentialId]` on the
      // issuer's most recently updated list - a field that has never existed
      // in the content type, so the lookup was always undefined and the branch
      // always answered "not revoked". It agreed with the `revoked` boolean
      // above only because the revoke controller sets both; anything that
      // flipped a bit in the list alone was reported as valid here.
      if (!credential.statusList || credential.statusListIndex == null) {
        return { revoked: false }
      }

      const list = await strapi.db.query('api::revocation-list.revocation-list').findOne({
        where: { id: credential.statusList.id },
      }) as RevocationList | null

      if (!list) {
        return { revoked: false }
      }

      const revocationListService = strapi.service('api::revocation-list.revocation-list')

      try {
        const revoked = await revocationListService.checkStatusInList(list, credential.statusListIndex)
        return revoked
          ? { revoked: true, reason: 'Revoked in the issuer\'s status list', date: list.lastUpdated }
          : { revoked: false }
      } catch (listError) {
        // Fail closed, the same way verification.ts does: an unreadable list
        // is not evidence that a credential is good.
        strapi.log.error(`[status] Status list ${list.id} could not be read: ${listError.message}`)
        return ctx.internalServerError('The issuer\'s revocation status list could not be read')
      }
    } catch (err) {
      console.error('Error checking credential status:', err)
      return ctx.internalServerError('Error checking credential status')
    }
  }
})) 