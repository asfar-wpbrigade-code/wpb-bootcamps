/**
 * Seed data for local development
 * Creates sample user, profile, achievement, and credential
 *
 * This script only runs if the seed data doesn't already exist
 */

import { randomUUID } from 'crypto';

interface SeedConfig {
  adminEmail: string;
  adminPassword: string;
  adminUsername: string;
  adminFirstName: string;
  adminLastName: string;
}

export const DEFAULT_SEED_CONFIG: SeedConfig = {
  adminEmail: 'admin@certo.com',
  adminPassword: 'certo',
  adminUsername: 'admin',
  adminFirstName: 'Certo',
  adminLastName: 'Admin',
};

// `profile`, `achievement`, and `credential` all have draftAndPublish
// enabled. strapi.entityService.create() - the legacy v4-compatibility API,
// used here (rather than the newer Document Service) so component fields
// like achievement's `criteria`/`skills` are populated correctly - defaults
// to also creating a *published* counterpart row for the same document,
// even with no `publishedAt` in the payload. That published row's id was
// found to be unstable: it can be replaced by a new id (the old one
// deleted) within moments of creation, apparently in reaction to
// subsequent updates on the draft row, e.g. as Strapi re-syncs the
// published version - not tied to a fixed delay this seed script could
// reliably wait out.
// The *draft* row's id, by contrast, was never observed to change or
// disappear across many repeated fresh installs. So every relation below
// is wired against the draft row's id, resolved explicitly via this
// helper rather than trusted from a `.create()`/`.update()` return value
// (which was also observed to sometimes be the draft, sometimes the
// published row, inconsistently). `publishedAt` itself is never set by
// this script - Strapi creates and keeps a published counterpart in sync
// on its own regardless. That published counterpart doesn't inherit the
// draft's relations automatically though, so syncPublishedEntries() below
// wires them a second time, directly on the published rows, once they've
// settled.
async function getDraftRow(strapi: any, uid: string, documentId: string): Promise<any> {
  const row = await strapi.db.query(uid).findOne({ where: { documentId, publishedAt: null } });
  if (!row) {
    throw new Error(`[Seed] Could not find draft row for ${uid} documentId=${documentId}`);
  }
  return row;
}

// Relations set on the draft row above are *not* copied onto its published
// counterpart automatically - the public API (which reads published
// entries by default) would otherwise show an achievement with no
// `creator`, and a credential with no `issuer`/`recipient`/`achievement`
// at all. This waits for that published row to stop churning (see the
// note above getDraftRow) and returns it, so its id can be used to wire
// relations between *published* rows - a published credential's `issuer`
// pointing at a *draft* profile (i.e. reusing the draft ids from above)
// was found to make that relation unpopulatable (populate on a published
// entity only follows links to other published entities), breaking
// verification with "Cannot read properties of null".
async function waitForStablePublishedRow(strapi: any, uid: string, documentId: string): Promise<any> {
  let matchCount = 0;
  let previousId: number | null = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const row = await strapi.db.query(uid).findOne({ where: { documentId, publishedAt: { $notNull: true } } });
    const currentId = row ? row.id : null;
    if (currentId !== null && currentId === previousId) {
      matchCount += 1;
      // Require several consecutive matches, not just one - this republish
      // process was observed to occasionally still replace an id that had
      // already matched once.
      if (matchCount >= 3) {
        return row;
      }
    } else {
      matchCount = 0;
    }
    previousId = currentId;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`[Seed] Timed out waiting for ${uid} documentId=${documentId} to publish`);
}

async function retryOnTransientFailure<T>(operation: () => Promise<T>, attempts = 5, delayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

// Resolves the current published row for the profile/achievement/credential
// documents and wires them together (see the note above
// waitForStablePublishedRow for why this can't just reuse the draft-linked
// relations from seedDevelopmentData/seedSampleCredential), including
// re-signing the credential's proof against a signing key that actually
// exists for the resolved published profile id.
async function syncPublishedEntries(strapi: any, apiUser: any, adminProfile: any, sampleAchievement: any, sampleCredential: any): Promise<void> {
  const [profilePublished, achievementPublished, credentialPublished] = await Promise.all([
    waitForStablePublishedRow(strapi, 'api::profile.profile', adminProfile.documentId),
    waitForStablePublishedRow(strapi, 'api::achievement.achievement', sampleAchievement.documentId),
    waitForStablePublishedRow(strapi, 'api::credential.credential', sampleCredential.documentId),
  ]);
  await strapi.db.query('api::profile.profile').update({
    where: { id: profilePublished.id },
    data: { owner: apiUser.id },
  });
  await strapi.db.query('api::achievement.achievement').update({
    where: { id: achievementPublished.id },
    data: { creator: profilePublished.id },
  });
  // The credential's proof was signed against the *draft* profile's issuer
  // key (the only id known at creation time - see seedSampleCredential).
  // Verification resolves the signing key via the credential's `issuer`
  // relation, which now points at profilePublished.id instead - a
  // different id, with no key of its own - so the proof is regenerated
  // against a key for that id, or verification would fail with "Issuer has
  // no signing key on record".
  const { SignJWT } = await import('jose');
  const baseUrl = strapi.config.get('server.url', 'http://localhost:1337');
  const credentialPayload = {
    credentialId: credentialPublished.credentialId,
    name: credentialPublished.name,
    description: credentialPublished.description,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    achievement: achievementPublished.id,
    issuer: profilePublished.id,
    recipient: profilePublished.id,
    issuanceDate: credentialPublished.issuanceDate,
  };
  const issuerKeys = strapi.service('api::profile.issuer-keys');
  const { privateKey } = await issuerKeys.getOrCreateKeyPair(profilePublished.id);
  const jws = await new SignJWT(credentialPayload)
    .setProtectedHeader({ alg: 'EdDSA' })
    .sign(privateKey);

  await strapi.db.query('api::credential.credential').update({
    where: { id: credentialPublished.id },
    data: {
      achievement: achievementPublished.id,
      issuer: profilePublished.id,
      recipient: profilePublished.id,
    },
  });
  // The `proof` component is set via entityService (not db.query, used for
  // the relations above) - db.query().create() was found earlier in this
  // script's development to mishandle component fields (they're stored via
  // their own join tables, similarly to relations, and go through the same
  // low-level id-validation code that rejects plain component data).
  await strapi.entityService.update('api::credential.credential', credentialPublished.id, {
    data: {
      proof: [{
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${baseUrl}/api/profiles/${profilePublished.id}/keys`,
        proofPurpose: 'assertionMethod',
        jws,
      }],
    },
  });
}

/**
 * Seeds the database with sample data for local development
 * Only runs if the admin user doesn't already exist
 */
export async function seedDevelopmentData(strapi: any): Promise<void> {
  // Only seed in development environment
  if (process.env.NODE_ENV === 'production') {
    strapi.log.info('[Seed] Skipping seed data in production environment');
    return;
  }

  try {
    // Check if Strapi admin user already exists
    const existingStrapiAdmin = await strapi.db.query('admin::user').findOne({
      where: { email: DEFAULT_SEED_CONFIG.adminEmail },
    });

    if (existingStrapiAdmin) {
      strapi.log.info('[Seed] Seed data already exists, skipping...');
      return;
    }

    strapi.log.info('[Seed] Creating seed data for local development...');

    // 1. Create Strapi Admin user (for /admin panel access)
    const superAdminRole = await strapi.db.query('admin::role').findOne({
      where: { code: 'strapi-super-admin' },
    });

    if (!superAdminRole) {
      strapi.log.error('[Seed] Super Admin role not found, cannot create admin user');
      return;
    }

    const hashedPassword = await strapi.service('admin::auth').hashPassword(DEFAULT_SEED_CONFIG.adminPassword);

    const strapiAdminUser = await strapi.db.query('admin::user').create({
      data: {
        firstname: DEFAULT_SEED_CONFIG.adminFirstName,
        lastname: DEFAULT_SEED_CONFIG.adminLastName,
        email: DEFAULT_SEED_CONFIG.adminEmail,
        password: hashedPassword,
        isActive: true,
        blocked: false,
        roles: [superAdminRole.id],
      },
    });

    // 2. Create users-permissions user (for frontend/API authentication)
    const authenticatedRole = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' } });

    if (!authenticatedRole) {
      strapi.log.error('[Seed] Authenticated role not found, cannot seed API user');
      return;
    }

    const userService = strapi.plugin('users-permissions').service('user');
    const apiUser = await userService.add({
      username: DEFAULT_SEED_CONFIG.adminUsername,
      email: DEFAULT_SEED_CONFIG.adminEmail,
      password: DEFAULT_SEED_CONFIG.adminPassword,
      provider: 'local',
      confirmed: true,
      blocked: false,
      role: authenticatedRole.id,
    });

    // 3. Create a profile for the admin user (as an Issuer)
    const adminProfileCreated = await strapi.entityService.create('api::profile.profile', {
      data: {
        name: 'Certo Admin',
        email: DEFAULT_SEED_CONFIG.adminEmail,
        description: 'Default administrator and issuer for Certo platform. This profile is used for testing and development purposes.',
        profileType: 'Both',
        url: 'https://certo.dev',
      },
    });
    const adminProfile = await getDraftRow(strapi, 'api::profile.profile', adminProfileCreated.documentId);
    // Link it to the API user via owner_id for multi-tenancy
    await strapi.db.query('api::profile.profile').update({
      where: { id: adminProfile.id },
      data: { owner: apiUser.id },
    });

    // 4. Create a sample achievement
    const sampleAchievementCreated = await strapi.entityService.create('api::achievement.achievement', {
      data: {
        name: 'Welcome to Certo',
        description: 'This badge is awarded to users who have successfully set up and explored the Certo platform. It demonstrates familiarity with the Open Badges 3.0 standard and the Certo credential management system.',
        achievementType: 'Achievement',
        achievementId: 'welcome-to-certo',
        tags: ['onboarding', 'welcome', 'getting-started'],
        criteria: {
          narrative: 'To earn this badge, you must:\n\n1. Set up a local development environment with Docker\n2. Create a user account\n3. Explore the credential management interface\n4. Understand the basics of Open Badges 3.0',
        },
        skills: [
          { skillName: 'Docker Basics', skillDescription: 'Understanding of containerized development environments' },
          { skillName: 'Open Badges 3.0', skillDescription: 'Familiarity with the Open Badges 3.0 specification' },
        ],
      },
    });
    const sampleAchievement = await getDraftRow(strapi, 'api::achievement.achievement', sampleAchievementCreated.documentId);
    await strapi.db.query('api::achievement.achievement').update({
      where: { id: sampleAchievement.id },
      data: { creator: adminProfile.id },
    });

    // 5. Create a sample credential (badge award) granted to the admin user
    const sampleCredential = await seedSampleCredential(strapi, adminProfile, sampleAchievement);

    // 6. Wire the same relations between each entity's *published*
    // counterpart, once each has stopped churning (see the note above
    // waitForStablePublishedRow) - cross-linking published rows to
    // *published* rows, not the drafts above. Deferred (not awaited) so it
    // doesn't hold up bootstrap()/server start. The stability check inside
    // waitForStablePublishedRow was itself still occasionally observed to
    // trust an id that got replaced moments later (a real Postgres
    // foreign-key violation on the write that followed) - so the whole
    // resolve-then-write sequence is retried from scratch, re-resolving
    // fresh published ids each time, rather than retrying a write against
    // ids that may already be stale.
    setTimeout(() => {
      retryOnTransientFailure(
        () => syncPublishedEntries(strapi, apiUser, adminProfile, sampleAchievement, sampleCredential),
        5,
        1000
      ).then(() => {
        strapi.log.info('[Seed] Synced seed data relations to published entries');
      }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        strapi.log.error(`[Seed] Error syncing seed data relations to published entries: ${message}`);
      });
    }, 500);

    // Log success message
    strapi.log.info('='.repeat(60));
    strapi.log.info('[Seed] SEED DATA CREATED SUCCESSFULLY');
    strapi.log.info('='.repeat(60));
    strapi.log.info('[Seed] Login credentials (same for admin panel and frontend):');
    strapi.log.info(`[Seed]   Email:    ${DEFAULT_SEED_CONFIG.adminEmail}`);
    strapi.log.info(`[Seed]   Password: ${DEFAULT_SEED_CONFIG.adminPassword}`);
    strapi.log.info('[Seed] Sample data: Admin User, Profile, Achievement, Credential');
    strapi.log.info('='.repeat(60));

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    strapi.log.error(`[Seed] Error seeding development data: ${message}`);
    if (error instanceof Error && error.stack) {
      strapi.log.error(`[Seed] Stack: ${error.stack}`);
    }
  }
}

async function seedSampleCredential(strapi: any, adminProfile: any, sampleAchievement: any): Promise<any> {
  const credentialId = `urn:uuid:${randomUUID()}`;
  const baseUrl = strapi.config.get('server.url', 'http://localhost:1337');

  // Generate cryptographic proof for the credential, signed with the
  // admin profile's own issuer keypair (generated on first use).
  let proof;
  try {
    const { SignJWT } = await import('jose');
    const credentialPayload = {
      credentialId,
      name: sampleAchievement.name,
      description: sampleAchievement.description,
      type: ['VerifiableCredential', 'OpenBadgeCredential'],
      achievement: sampleAchievement.id,
      issuer: adminProfile.id,
      recipient: adminProfile.id,
      issuanceDate: new Date().toISOString(),
    };
    const issuerKeys = strapi.service('api::profile.issuer-keys');
    const { privateKey } = await issuerKeys.getOrCreateKeyPair(adminProfile.id);
    const jws = await new SignJWT(credentialPayload)
      .setProtectedHeader({ alg: 'EdDSA' })
      .sign(privateKey);
    proof = {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      verificationMethod: `${baseUrl}/api/profiles/${adminProfile.id}/keys`,
      proofPurpose: 'assertionMethod',
      jws
    };
  } catch (proofError) {
    // strapi.log.warn/error only print their first argument - Strapi's
    // logger doesn't do printf-style multi-arg concatenation like
    // console.warn does, so a second argument here is silently dropped.
    // Interpolate error details into the message itself instead.
    strapi.log.warn(`[Seed] Could not generate cryptographic proof, using placeholder: ${proofError instanceof Error ? proofError.message : proofError}`);
    proof = {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      verificationMethod: `${baseUrl}/api/profiles/${adminProfile.id}/keys`,
      proofPurpose: 'assertionMethod',
      proofValue: 'z' + randomUUID().replace(/-/g, '')
    };
  }

  const sampleCredentialCreated = await strapi.entityService.create('api::credential.credential', {
    data: {
      credentialId,
      name: 'Welcome to Certo',
      description: 'Congratulations! You have been awarded the Welcome to Certo badge for setting up your development environment.',
      type: ['VerifiableCredential', 'OpenBadgeCredential'],
      issuanceDate: new Date(),
      narrative: 'This credential was automatically issued upon first setup of the Certo development environment. It serves as a sample credential to help you explore the platform features.',
      revoked: false,
      proof: [proof],
    },
  });
  const sampleCredential = await getDraftRow(strapi, 'api::credential.credential', sampleCredentialCreated.documentId);

  await strapi.db.query('api::credential.credential').update({
    where: { id: sampleCredential.id },
    data: {
      achievement: sampleAchievement.id,
      issuer: adminProfile.id,
      recipient: adminProfile.id,
    },
  });

  strapi.log.info('[Seed] Sample credential created successfully');
  return sampleCredential;
}

export default seedDevelopmentData;
