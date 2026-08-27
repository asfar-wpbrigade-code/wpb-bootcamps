/**
 * achievement router
 *
 * Reading achievements is public: a badge definition is meant to be
 * inspectable by anyone verifying a certificate issued against it.
 *
 * Writing is not. `create`/`update`/`delete` used to carry `auth: false`,
 * which does not mean "treat the caller as the Public role" - it removes the
 * authorization layer entirely, so the read-only permissions the bootstrap
 * grants Public were never consulted. The result was full anonymous CRUD:
 * anyone could create, rename or delete badge templates, and deleting one
 * orphans every certificate issued from it.
 *
 * Left to the default (authenticated) these actions go through Strapi's
 * permission system, where the `authenticated` role already holds
 * achievement create/update/delete - see bootstrap/permissions-setup.ts.
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreRouter('api::achievement.achievement', {
  config: {
    find: {
      auth: false
    },
    findOne: {
      auth: false
    }
  }
})
