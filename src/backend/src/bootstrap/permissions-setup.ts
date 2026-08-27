/**
 * Permission setup for Strapi v5
 * Creates and enables permissions for authenticated users
 */

// Permissions to enable for authenticated users
const AUTHENTICATED_PERMISSIONS = [
  // Profile permissions
  'api::profile.profile.find',
  'api::profile.profile.findOne',
  'api::profile.profile.create',
  'api::profile.profile.update',
  'api::profile.profile.delete',
  'api::profile.profile.me',
  'api::profile.profile.myIssuedCredentials',
  'api::profile.profile.myReceivedCredentials',
  'api::profile.profile.findIssuedCredentials',
  'api::profile.profile.findReceivedCredentials',
  'api::profile.profile.exportMyData',
  'api::profile.profile.importMyData',
  'api::profile.profile.dashboardStats',

  // Achievement permissions
  'api::achievement.achievement.find',
  'api::achievement.achievement.findOne',
  'api::achievement.achievement.create',
  'api::achievement.achievement.update',
  'api::achievement.achievement.delete',
  // Custom controller actions. Permission ids are
  // `api::<api>.<content-type>.<controller action>`, so these must match the
  // handler names in api/achievement/routes/ exactly. They were unnecessary
  // while those routes carried `auth: false` (which skips the permission
  // check entirely) and became load-bearing the moment that was removed -
  // the issue page's template picker calls findByCreator and got a 403.
  // `...achievement.credentials` used to sit here and matches no action on
  // the controller; it granted nothing.
  'api::achievement.achievement.findByCreator',
  'api::achievement.achievement.findWithCredentials',
  'api::achievement.achievement.createAchievement',
  
  // Credential permissions
  'api::credential.credential.find',
  'api::credential.credential.findOne',
  'api::credential.credential.create',
  'api::credential.credential.update',
  'api::credential.credential.delete',
  'api::credential.credential.issue',
  'api::credential.credential.batchIssue',
  'api::credential.credential.verify',
  'api::credential.credential.validate',
  'api::credential.credential.revoke',
  'api::credential.credential.import',
  'api::credential.credential.export',
  'api::credential.credential.certificate',
  'api::credential.credential.renew',
  'api::credential.credential.expirationCheck',
  
  // Scheduled issuance permissions
  'api::scheduled-issuance.scheduled-issuance.create',
  'api::scheduled-issuance.scheduled-issuance.find',
  'api::scheduled-issuance.scheduled-issuance.cancel',
  'api::scheduled-issuance.scheduled-issuance.runCheck',

  // Evidence permissions
  'api::evidence.evidence.find',
  'api::evidence.evidence.findOne',
  'api::evidence.evidence.create',
  'api::evidence.evidence.update',
  'api::evidence.evidence.delete',
  
  // Endorsement permissions
  'api::endorsement.endorsement.find',
  'api::endorsement.endorsement.findOne',
  'api::endorsement.endorsement.create',
  'api::endorsement.endorsement.update',
  'api::endorsement.endorsement.delete',
  'api::endorsement.endorsement.verify',

  // Webhook subscription management
  'api::webhook-subscription.webhook-subscription.find',
  'api::webhook-subscription.webhook-subscription.findOne',
  'api::webhook-subscription.webhook-subscription.create',
  'api::webhook-subscription.webhook-subscription.update',
  'api::webhook-subscription.webhook-subscription.delete',
];

// Permissions to enable for the issuer role
const ISSUER_PERMISSIONS = [
  // Webhook subscription management
  'api::webhook-subscription.webhook-subscription.find',
  'api::webhook-subscription.webhook-subscription.findOne',
  'api::webhook-subscription.webhook-subscription.create',
  'api::webhook-subscription.webhook-subscription.update',
  'api::webhook-subscription.webhook-subscription.delete',

  // Credential permissions
  'api::credential.credential.find',
  'api::credential.credential.findOne',
  'api::credential.credential.create',
  'api::credential.credential.update',
  'api::credential.credential.delete',
  'api::credential.credential.issue',
  'api::credential.credential.batchIssue',
  'api::credential.credential.validate',
  'api::credential.credential.verify',
  'api::credential.credential.import',
  'api::credential.credential.export',
  'api::credential.credential.revoke',
  'api::credential.credential.renew',
  'api::profile.profile.find',
  'api::profile.profile.findOne',
  'api::profile.profile.me',
  'api::profile.profile.myIssuedCredentials',
  'api::profile.profile.myReceivedCredentials',
  'api::profile.profile.exportMyData',
  'api::profile.profile.importMyData',
  'api::profile.profile.dashboardStats',

  // Achievement permissions
  'api::achievement.achievement.find',
  'api::achievement.achievement.findOne',
  'api::achievement.achievement.create',
  'api::achievement.achievement.update',
  'api::achievement.achievement.delete',
];

// Permissions to enable for the reviewer role: read/verify everything,
// no create/update/delete.
const REVIEWER_PERMISSIONS = [
  'api::profile.profile.find',
  'api::profile.profile.findOne',

  'api::achievement.achievement.find',
  'api::achievement.achievement.findOne',

  'api::credential.credential.find',
  'api::credential.credential.findOne',
  'api::credential.credential.verify',
  'api::credential.credential.validate',

  'api::evidence.evidence.find',
  'api::evidence.evidence.findOne',
];

// Permissions to enable for the viewer role: read-only, narrower than
// reviewer (no evidence, no verify beyond what's already public).
const VIEWER_PERMISSIONS = [
  'api::profile.profile.find',
  'api::profile.profile.findOne',

  'api::achievement.achievement.find',
  'api::achievement.achievement.findOne',

  'api::credential.credential.find',
  'api::credential.credential.findOne',
];

// Permissions to enable for public users
const PUBLIC_PERMISSIONS = [
  // Profile - read only
  'api::profile.profile.find',
  'api::profile.profile.findOne',
  'api::profile.profile.findIssuedCredentials',
  'api::profile.profile.findReceivedCredentials',
  
  // Achievement - read only
  'api::achievement.achievement.find',
  'api::achievement.achievement.findOne',
  'api::achievement.achievement.credentials',
  
  // Credential - read and verify
  'api::credential.credential.find',
  'api::credential.credential.findOne',
  'api::credential.credential.verify',
  'api::credential.credential.validate',
  'api::credential.credential.certificate',
  
  // Evidence - read only
  'api::evidence.evidence.find',
  'api::evidence.evidence.findOne',
  
  // Endorsement - read and verify
  'api::endorsement.endorsement.find',
  'api::endorsement.endorsement.findOne',
  'api::endorsement.endorsement.verify',
];

/**
 * Setup permissions for a specific role.
 *
 * `optional` marks a role this project ships a permission list for but does
 * not create: `issuer`, `reviewer` and `viewer` only exist once an admin adds
 * them in Settings > Users & Permissions > Roles. Their absence is the normal
 * state, not a fault - logging it per-role at error level meant three false
 * alarms on every boot, which is exactly the noise a real error then hides in.
 *
 * @returns 'ok' when the role was found and configured, 'missing' otherwise
 */
async function setupRolePermissions(strapi: any, roleType: string, permissions: string[], { optional = false } = {}): Promise<'ok' | 'missing'> {
  const role = await strapi
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: roleType } });

  if (!role) {
    // Required roles are Strapi built-ins - if one is gone, something is wrong.
    if (!optional) {
      strapi.log.error(`[Permissions] ${roleType} role not found`);
    }
    return 'missing';
  }

  strapi.log.info(`[Permissions] Setting up ${roleType} permissions...`);

  let created = 0;
  let linked = 0;

  for (const action of permissions) {
    try {
      // Check if permission exists
      let permission = await strapi
        .query('plugin::users-permissions.permission')
        .findOne({ where: { action } });

      // Create permission if it doesn't exist
      if (!permission) {
        permission = await strapi
          .query('plugin::users-permissions.permission')
          .create({ data: { action } });
        created++;
      }

      // Check if permission is already linked to role
      const existingLink = await strapi.db.query('plugin::users-permissions.permission').findOne({
        where: { 
          action,
        },
        populate: ['role'],
      });

      // Link permission to role if not already linked
      const isLinked = existingLink?.role?.id === role.id;
      
      if (!isLinked) {
        // Use raw query to create the link
        await strapi.db.connection.raw(`
          INSERT INTO up_permissions_role_lnk (permission_id, role_id, permission_ord)
          VALUES (?, ?, 1)
          ON CONFLICT DO NOTHING
        `, [permission.id, role.id]);
        linked++;
      }
    } catch (error) {
      // Ignore duplicate key errors
      if (!String(error).includes('duplicate key')) {
        strapi.log.warn(`[Permissions] Could not set ${action}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  strapi.log.info(`[Permissions] ${roleType}: created ${created} permissions, linked ${linked} to role`);

  return 'ok';
}

/**
 * Main permission setup function
 */
export async function setupPermissions(strapi: any): Promise<void> {
  strapi.log.info('[Permissions] Starting permission setup...');
  
  try {
    // Strapi's built-in roles - these must exist.
    await setupRolePermissions(strapi, 'authenticated', AUTHENTICATED_PERMISSIONS);
    await setupRolePermissions(strapi, 'public', PUBLIC_PERMISSIONS);

    // Optional roles. Their permission lists stay inert until an admin creates
    // matching roles in the admin panel (Settings > Users & Permissions >
    // Roles). See docs/known-issues-and-dev-notes.md and docs/security.md.
    const optionalRoles: Array<[string, string[]]> = [
      ['issuer', ISSUER_PERMISSIONS],
      ['reviewer', REVIEWER_PERMISSIONS],
      ['viewer', VIEWER_PERMISSIONS],
    ];

    const absent: string[] = [];

    for (const [roleType, permissions] of optionalRoles) {
      const result = await setupRolePermissions(strapi, roleType, permissions, { optional: true });
      if (result === 'missing') absent.push(roleType);
    }

    if (absent.length > 0) {
      strapi.log.info(`[Permissions] Optional roles not present, permission lists skipped: ${absent.join(', ')}. Create them under Settings > Users & Permissions > Roles to activate.`);
    }

    strapi.log.info('[Permissions] Permission setup complete');
  } catch (error) {
    strapi.log.error(`[Permissions] Error setting up permissions: ${error instanceof Error ? error.message : error}`);
  }
}

export default setupPermissions;
