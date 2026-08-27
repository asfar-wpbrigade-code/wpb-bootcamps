/**
 * Credential service
 */

import { factories } from '@strapi/strapi'
import { getNotificationProvider } from './notification-providers'
import { channelAlerts } from './channel-alerts/index'
import { credentialsIssuedTotal } from '../../../monitoring/metrics'

export default factories.createCoreService('api::credential.credential', ({ strapi }) => ({
  /**
   * Issue a new credential
   * @param {Object} achievement - The achievement to issue
   * @param {Object} recipient - The recipient profile
   * @param {Array} evidence - Optional evidence items
   * @param {string} expirationDate - Optional expiration date for the credential
   * @param {number} [actorId] - The users-permissions user id of the caller, for the audit log
   */
  async issue(achievement, recipient, evidence = [], expirationDate = undefined, actorId = undefined) {
    try {
      // Validated before anything is written. Everything below creates rows,
      // and a failure past that point used to leave a recipient profile and a
      // working login account behind for someone who never received a
      // certificate - one non-ISO date in a CSV cell was enough, because the
      // date only failed at the credential insert, long after the account.
      const validExpirationDate = this.normaliseExpirationDate(expirationDate)

      // Whether these already existed decides what rollbackNewRecipient may
      // remove if the issuance fails: never touch a profile or account that
      // was already there and has its own history.
      const profileExisted = await this.recipientProfileExists(recipient)
      const recipientEntity = await this.findOrCreateRecipientProfile(recipient)

      // Find or create user associated with the profile
      const userExisted = await this.recipientUserExists(recipientEntity.email)
      await this.findOrCreateUser(recipientEntity)

      // Make sure the issuer has a signing key *before* reading their profile
      // id below. Creating a key mirrors the public key onto the issuer's own
      // profile, and in Strapi 5 that update replaces the profile's published
      // row with a new numeric id - leaving any id read earlier dangling. That
      // is why the first-ever issuance for a given issuer used to fail with
      // "Issuer not found" from getOrCreateActiveListForIssuer below: the key
      // was created mid-issuance, renumbering the very profile we had just
      // read off `achievement.creator`. Doing it up front, then re-resolving
      // the id by documentId (stable across republishes), means the signed
      // payload, the proof's verificationMethod, the status list and the
      // credential row all reference a row that still exists.
      if (achievement.creator?.id) {
        await strapi.service('api::profile.issuer-keys').getOrCreateKeyPair(achievement.creator.id)
      }
      const issuerId = await this.resolveCurrentIssuerId(achievement.creator)

      // Refuse rather than continue without one. Strapi silently drops a
      // relation pointing at a row that no longer exists, so an unresolved
      // issuer produced a *published* credential with no issuer link at all -
      // which then failed serialisation with "missing an associated issuer"
      // after the row was already written, and before the recipient email.
      // The result was unverifiable certificates and no notification.
      if (!issuerId) {
        throw new Error('Could not resolve the issuing profile - the achievement\'s creator no longer exists')
      }

      // Generate a unique credential ID
      const credentialId = `urn:uuid:${this.generateUUID()}`

      // Prepare the credential payload for signing (excluding proof)
      const credentialPayload = {
        credentialId,
        name: achievement.name,
        description: achievement.description,
        type: ['VerifiableCredential', 'OpenBadgeCredential'],
        achievement: achievement.id,
        issuer: issuerId,
        recipient: recipientEntity.id,
        issuanceDate: new Date(),
        revoked: false,
        publishedAt: new Date(),
        ...(validExpirationDate ? { expirationDate: validExpirationDate } : {})
      }
      // Generate cryptographic proof (JWS)
      const proof = await this.generateProof(credentialPayload.issuer, credentialPayload)

      // Reserve a slot for this credential in the issuer's revocation
      // status list (StatusList2021), creating the list on first use.
      const revocationListService = strapi.service('api::revocation-list.revocation-list')
      const statusList = await revocationListService.getOrCreateActiveListForIssuer(credentialPayload.issuer)
      const statusListIndex = await revocationListService.assignNextIndex(statusList.id)

      // Create the credential
      const credential = await this.createCredentialOrRollback({
        profileExisted,
        userExisted,
        recipientEntity,
      }, () => strapi.entityService.create('api::credential.credential', {
        data: {
          credentialId,
          name: achievement.name,
          description: achievement.description,
          type: ['VerifiableCredential', 'OpenBadgeCredential'],
          achievement: achievement.id,
          issuer: issuerId,
          recipient: recipientEntity.id,
          issuanceDate: new Date(),
          revoked: false,
          publishedAt: new Date(),
          proof: [proof],
          statusList: statusList.id,
          statusListIndex,
          ...(validExpirationDate ? { expirationDate: validExpirationDate } : {})
        }
      }))

      // Explicitly connect the credential to the recipient's profile.
      // This ensures the bidirectional relationship is updated.
      if (recipientEntity && recipientEntity.id && credential && credential.id) {
        await strapi.entityService.update('api::profile.profile', recipientEntity.id, {
          data: {
            receivedCredentials: {
              connect: [{ id: credential.id }],
            },
            publishedAt: new Date(),
          },
        })
      }

      // Add evidence if provided
      if (evidence && evidence.length > 0) {
        for (const item of evidence) {
          if (item.name || item.description) {
            await strapi.entityService.create('api::evidence.evidence', {
              data: {
                name: item.name || 'Evidence',
                description: item.description || '',
                credential: credential.id,
                publishedAt: new Date(),
              }
            })
          }
        }
      }

      // Return the full credential with populated relations
      const populatedCredential = await strapi.entityService.findOne(
        'api::credential.credential',
        credential.id,
        {
          status: 'published',
          populate: [
            'achievement',
            'issuer',
            'recipient',
            'evidence',
            'proof'
          ],
        }
      )

      // Convert to Open Badge format
      const openBadgeService = strapi.service('api::credential.open-badge')
      const serializedCredential = await openBadgeService.serializeCredential(credential.id)

      // Send notification email to recipient
      let emailSent = false
      let emailError = null

      try {
        if (recipientEntity.email) {
          // Check if a user was created for this profile
          const user = await strapi.query('plugin::users-permissions.user').findOne({
            where: { email: recipientEntity.email }
          })

          const frontendUrl = strapi.config.get('frontend.url', 'http://localhost:3000')

          const notificationProvider = getNotificationProvider(strapi)
          await notificationProvider.sendCredentialIssued({
            to: recipientEntity.email,
            achievement,
            credential,
            frontendUrl,
            user,
            recipientName: recipientEntity.name,
          })

          emailSent = true
        }
      } catch (e) {
        console.error('Failed to send notification email:', e)
        emailError = e.message
      }

      // Notify any registered webhook subscriptions. Best-effort: dispatch()
      // never throws (each delivery is individually caught/logged), so this
      // can't fail the issuance itself.
      const webhookDispatcher = strapi.service('api::webhook-subscription.dispatch')
      await webhookDispatcher.dispatch('credential.issued', {
        credentialId: credential.credentialId,
        achievementId: achievement.id,
        issuerId: credentialPayload.issuer,
        recipientId: recipientEntity.id,
      })

      // Record who issued this - see known-issues-and-dev-notes.md item 5
      // (this controller path disables the normal permission check).
      const auditLog = strapi.service('api::audit-log-entry.audit-log')
      await auditLog.record({
        action: 'credential.issue',
        entityType: 'credential',
        entityId: credential.id,
        actorId,
        metadata: { achievementId: achievement.id, recipientId: recipientEntity.id },
      })
      credentialsIssuedTotal.inc()

      // Fan out admin channel alerts (Slack/Teams/Discord) — best-effort, never throws
      const frontendUrl = strapi.config.get('custom.frontendUrl', 'http://localhost:3000')
      channelAlerts.sendCredentialIssued({
        credentialId: credential.credentialId,
        credentialUrl: `${frontendUrl}/credentials/${encodeURIComponent(credential.credentialId)}`,
        achievementName: (achievement as any).achievementType ?? (achievement as any).name ?? 'Unknown',
        recipientEmail: (recipientEntity as any).email ?? '',
      }).catch(() => { /* already logged inside channelAlerts */ })
      return {
        credential: populatedCredential,
        openBadge: serializedCredential,
        notification: {
          sent: emailSent,
          error: emailError
        }
      }
    } catch (error) {
      console.error('Error issuing credential:', error)
      throw error
    }
  },

  /**
   * Find or create the recipient profile for an incoming credential -
   * either an existing profile by id, an existing one by email, or a new
   * bare Recipient profile if neither exists yet. Shared by issue() and by
   * the profile data-portability service's import path.
   * @param {Object} recipient - `{ id }` or `{ email, name }`
   */
  /**
   * Parses an expiration date, or throws with something a person can act on.
   *
   * Only unambiguous formats are accepted - `31/12/2027` and `12/31/2027` are
   * the same characters meaning different days, and silently guessing sets a
   * real certificate to expire on the wrong date. Previously an unparseable
   * value reached the database and came back as a raw SQL insert statement.
   *
   * @param {string|Date} [value] - The supplied expiration date
   * @returns {Date|undefined} A valid date, or undefined when none was given
   */
  normaliseExpirationDate(value) {
    if (!value) return undefined

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new Error('Expiration date is not a valid date')
      }
      return value
    }

    const trimmed = String(value).trim()
    if (!trimmed) return undefined

    const match = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/)
    if (!match) {
      throw new Error(`Expiration date "${trimmed}" must be in YYYY-MM-DD format`)
    }

    const [, year, month, day] = match
    const iso = `${year}-${month}-${day}`
    const parsed = new Date(`${iso}T00:00:00.000Z`)

    // Rejects 2027-02-31, which Date rolls forward into March instead of
    // reporting as invalid.
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
      throw new Error(`Expiration date "${trimmed}" is not a real date`)
    }

    return parsed
  },

  /** Whether a recipient profile already exists for this recipient. */
  async recipientProfileExists(recipient) {
    if (recipient?.id && recipient.id !== 0) return true
    if (!recipient?.email) return false

    const existing = await strapi.db.query('api::profile.profile').findOne({
      where: { email: recipient.email },
      select: ['id'],
    })

    return Boolean(existing)
  },

  /** Whether a login account already exists for this email address. */
  async recipientUserExists(email) {
    if (!email) return false

    const existing = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { email },
      select: ['id'],
    })

    return Boolean(existing)
  },

  /**
   * Creates the credential, undoing the recipient rows this call created if
   * it fails.
   *
   * Issuance writes a profile and a login account before the credential, so
   * a failed insert used to leave both behind - a real account, with a real
   * password-reset path, for someone who was never issued anything. Repeated
   * bad rows accumulated them.
   *
   * Compensation rather than a transaction: the profile and account are
   * written through the document service, whose draft/publish handling spans
   * several rows per entity, and unpicking that inside one transaction is
   * more fragile than deleting exactly what we know we added. Cleanup
   * failures are logged and swallowed - the original error is the one worth
   * reporting.
   */
  async createCredentialOrRollback({ profileExisted, userExisted, recipientEntity }, create) {
    try {
      return await create()
    } catch (error) {
      if (!userExisted && recipientEntity?.email) {
        try {
          await strapi.db.query('plugin::users-permissions.user').deleteMany({
            where: { email: recipientEntity.email },
          })
        } catch (cleanupError) {
          strapi.log.error(`[credential.issue] Could not remove the account created for ${recipientEntity.email}: ${cleanupError.message}`)
        }
      }

      if (!profileExisted && recipientEntity?.documentId) {
        try {
          await strapi.db.query('api::profile.profile').deleteMany({
            where: { documentId: recipientEntity.documentId },
          })
        } catch (cleanupError) {
          strapi.log.error(`[credential.issue] Could not remove the profile created for ${recipientEntity.email}: ${cleanupError.message}`)
        }
      }

      if (!profileExisted || !userExisted) {
        strapi.log.info(`[credential.issue] Issuance failed for ${recipientEntity?.email}; removed the profile/account this attempt created`)
      }

      throw error
    }
  },

  async findOrCreateRecipientProfile(recipient) {
    let recipientEntity = null

    if (recipient.id && recipient.id !== 0) {
      recipientEntity = await strapi.entityService.findOne(
        'api::profile.profile',
        recipient.id,
        { status: 'published' }
      )
    } else if (recipient.email) {
      const existingRecipients = await strapi.entityService.findMany(
        'api::profile.profile',
        {
          filters: { email: recipient.email },
          status: 'published',
        }
      )

      if (existingRecipients && existingRecipients.length > 0) {
        recipientEntity = await this.syncRecipientName(existingRecipients[0], recipient.name)
      } else {
        recipientEntity = await strapi.entityService.create('api::profile.profile', {
          data: {
            name: recipient.name,
            email: recipient.email,
            profileType: 'Recipient',
            publishedAt: new Date(),
          }
        })
      }
    }

    if (!recipientEntity) {
      throw new Error('Unable to find or create recipient profile')
    }

    return recipientEntity
  },

  /**
   * Bring an existing recipient profile's name up to date with the one the
   * issuer supplied for this issuance.
   *
   * Recipient profiles are matched by email, so the second certificate sent
   * to an address reuses the first one's profile - and used to keep the name
   * captured back then, silently ignoring whatever the issuer typed this
   * time. The issuer is the authority on the recipient's name here, so a new
   * non-empty value wins.
   *
   * Note this is the recipient's name platform-wide, not a per-certificate
   * label: their certificates all render from this profile, so correcting a
   * name corrects it on the ones already issued too. That is the intended
   * behaviour for what is one person under one email address.
   *
   * @param {Object} profile - The existing recipient profile
   * @param {string} suppliedName - The name given for this issuance
   */
  async syncRecipientName(profile, suppliedName) {
    const name = typeof suppliedName === 'string' ? suppliedName.trim() : ''

    if (!name || name === profile.name) {
      return profile
    }

    await strapi.entityService.update('api::profile.profile', profile.id, {
      data: { name, publishedAt: new Date() },
    })

    // That update replaces the profile's published row with a new numeric id
    // (see resolveCurrentIssuerId for the same hazard on the issuer side), so
    // re-read it by documentId - the caller is about to link a credential to
    // whatever this returns.
    const current = profile.documentId
      ? await strapi.db.query('api::profile.profile').findOne({
          where: { documentId: profile.documentId, publishedAt: { $notNull: true } },
        })
      : null

    strapi.log.info(`[credential.issue] Recipient ${profile.email} renamed from "${profile.name ?? ''}" to "${name}"`)

    return current ?? { ...profile, name }
  },

  /**
   * Find or create a user associated with a profile
   * @param {Object} profile - The profile to associate with a user
   */
  async findOrCreateUser(profile) {
    try {
      if (!profile.email) {
        return null
      }

      // Check if user already exists
      const existingUser = await strapi.query('plugin::users-permissions.user').findOne({
        where: { email: profile.email },
        populate: {
          role: true,
          createdBy: true,
          updatedBy: true,
          localizations: true,
          provider: true,
          resetPasswordToken: true,
          username: true,
          email: true,
          password: true,
          locale: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true
        }
      })

      if (existingUser) {
        return existingUser
      }

      // Get the authenticated role
      const authenticatedRole = await strapi
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: 'authenticated' } })

      if (!authenticatedRole) {
        console.error('Authenticated role not found')
        return null
      }

      // Generate a random password
      const randomPassword = this.generateRandomPassword()

      // Create a new user with a random password
      const newUser = await strapi.service('plugin::users-permissions.user').add({
        username: profile.email.split('@')[0] + Date.now(),
        email: profile.email,
        password: randomPassword,
        role: authenticatedRole.id,
        confirmed: true,
        provider: 'local'
      })

      return newUser
    } catch (error) {
      console.error('Error finding or creating user:', error)
      return null
    }
  },

  /**
   * Generate a random password
   * @returns {string} A random password
   */
  generateRandomPassword() {
    const length = 12
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()'
    let password = ''
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length)
      password += charset[randomIndex]
    }
    
    return password
  },

  /**
   * Get or create a default system issuer profile
   */
  async getDefaultIssuerId() {
    try {
      // Try to find a system issuer
      const existingIssuers = await strapi.entityService.findMany('api::profile.profile', {
        filters: { name: 'System Issuer' },
        status: 'published',
      })
      
      if (existingIssuers && existingIssuers.length > 0) {
        return existingIssuers[0].id
      }
      
      // Create a default system issuer
      const systemIssuer = await strapi.entityService.create('api::profile.profile', {
        data: {
          name: 'System Issuer',
          profileType: 'Issuer',
          publishedAt: new Date(),
        }
      })
      
      return systemIssuer.id
    } catch (error) {
      console.error('Error getting default issuer:', error)
      return null
    }
  },

  /**
   * Generate cryptographic proof for a credential, signed with the
   * issuer's own keypair (generated on first use - see
   * api::profile.issuer-keys). Throws rather than falling back to a fake
   * proof: an unsigned "signed" credential is worse than a failed issuance.
   * @param {string} issuerId - The ID of the issuer profile
   * @param {Object} credentialPayload - The credential payload
   */
  async generateProof(issuerId, credentialPayload) {
    const baseUrl = strapi.config.get('server.url', 'http://localhost:1337')
    const payload = { ...credentialPayload }
    delete payload.proof

    const issuerKeys = strapi.service('api::profile.issuer-keys')
    const { privateKey } = await issuerKeys.getOrCreateKeyPair(issuerId)

    const { SignJWT } = await import('jose')
    const jws = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'EdDSA' })
      .sign(privateKey)

    return {
      type: "Ed25519Signature2020",
      created: new Date().toISOString(),
      verificationMethod: `${baseUrl}/api/profiles/${issuerId}/keys`,
      proofPurpose: "assertionMethod",
      jws
    }
  },

  /**
   * Resolve an issuer profile's *current* published row id.
   *
   * Strapi 5 gives every document a stable `documentId` but a numeric row
   * id that is replaced each time the document is republished - so a
   * numeric id read from a populated relation can already refer to a
   * deleted row. Looks the profile up by documentId and falls back to the
   * id we were given when there is nothing better to go on (an unpopulated
   * relation, or a caller that passed a bare id).
   *
   * @param {Object} creator - The populated issuer profile relation
   * @returns {Promise<number|string|undefined>} The current row id
   */
  async resolveCurrentIssuerId(creator) {
    if (!creator) return undefined
    if (!creator.documentId) return creator.id

    const current = await strapi.db.query('api::profile.profile').findOne({
      where: { documentId: creator.documentId, publishedAt: { $notNull: true } },
      select: ['id'],
    })

    // No `?? creator.id` fallback: that id has just been shown not to exist
    // (the profile was mid-republish), and passing it on produced a
    // credential with a silently dropped issuer relation. Undefined makes
    // the caller fail instead.
    return current?.id
  },

  /**
   * Generate a UUID v4
   * @returns {string} A UUID v4 string
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  },
}))
