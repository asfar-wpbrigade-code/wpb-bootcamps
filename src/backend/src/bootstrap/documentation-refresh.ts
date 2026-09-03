/**
 * Regenerates the OpenAPI spec on every boot.
 *
 * @strapi/plugin-documentation only regenerates when NODE_ENV is not
 * production - see the `if (process.env.NODE_ENV !== 'production')` guard in
 * its own bootstrap. A deployed instance therefore serves whatever
 * `full_documentation.json` happens to be sitting in src/extensions, which is
 * whatever a developer last committed.
 *
 * That artifact had gone a month stale and documented none of the custom
 * routes - no /profiles/me, no /credentials/:id/certificate, no /dashboard/
 * stats - while still publishing Strapi's placeholder contact block. A public
 * document that quietly describes a different API than the one running is
 * worse than no document, because nobody knows to distrust it.
 *
 * Regenerating here costs about a second at startup and keeps the published
 * spec matching the code actually deployed. Failure is logged and swallowed:
 * out-of-date documentation is not a reason to refuse to start.
 */
import { customRouteDocumentation } from '../documentation/custom-routes'

/**
 * Registers the hand-written OpenAPI for the routes the generator cannot see.
 *
 * Must run in register(), not bootstrap(): outside production the plugin
 * generates the spec in its own bootstrap, which runs first, so an override
 * registered any later would miss that pass entirely.
 *
 * No excludeFromGeneration - the override is merged over the generated paths,
 * so the auto-documented CRUD for each content type survives.
 */
export function registerCustomRouteDocumentation(strapi: any): void {
  const documentation = strapi.plugin('documentation')

  if (!documentation) {
    return
  }

  try {
    documentation.service('override').registerOverride(customRouteDocumentation)
  }
  catch (error: any) {
    strapi.log.error(`[documentation] Could not register custom route docs: ${error?.message}`)
  }
}

export async function refreshApiDocumentation(strapi: any): Promise<void> {
  // Outside production the plugin has already done this in its own bootstrap,
  // which runs before this one; repeating it only slows local startup.
  if (process.env.NODE_ENV !== 'production') {
    return
  }

  const documentation = strapi.plugin('documentation')

  if (!documentation) {
    return
  }

  try {
    await documentation.service('documentation').generateFullDoc()
    strapi.log.info('[documentation] OpenAPI spec regenerated from the running routes')
  }
  catch (error: any) {
    strapi.log.error(`[documentation] Could not regenerate the OpenAPI spec: ${error?.message}`)
  }
}
