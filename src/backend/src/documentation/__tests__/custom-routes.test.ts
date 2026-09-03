import fs from 'node:fs'
import path from 'node:path'
import { customRouteDocumentation as doc } from '../custom-routes'

const API_DIR = path.resolve(__dirname, '../../api')

/**
 * Paths deliberately left undocumented.
 *
 * `/api/credentials` is a double-prefixed fallback for clients that add the
 * `/api` prefix themselves; it reaches the same handler as `/credentials` and
 * publishing it would only invite people to depend on it.
 */
const NOT_DOCUMENTED = new Set(['/api/credentials'])

/** Strapi writes `:id`; OpenAPI wants `{id}`. */
function toOpenApiPath(routePath: string): string {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

/**
 * Every route defined in a file *not* named after its content type, since the
 * documentation plugin only reads the content-type-named router and cannot see
 * these. Collected from source rather than from a running Strapi so the check
 * needs no database.
 */
function collectInvisibleRoutes(): { api: string, file: string, path: string }[] {
  const found: { api: string, file: string, path: string }[] = []

  for (const api of fs.readdirSync(API_DIR)) {
    const routesDir = path.join(API_DIR, api, 'routes')
    if (!fs.existsSync(routesDir)) continue

    for (const file of fs.readdirSync(routesDir)) {
      if (!file.endsWith('.ts')) continue
      // The content-type-named router is the one the generator does read.
      if (file === `${api}.ts`) continue

      const source = fs.readFileSync(path.join(routesDir, file), 'utf8')
      for (const match of source.matchAll(/path:\s*'([^']+)'/g)) {
        found.push({ api, file, path: toOpenApiPath(match[1]) })
      }
    }
  }

  return found
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete']

describe('custom route documentation', () => {
  it('documents every route the generator cannot see', () => {
    const missing = collectInvisibleRoutes()
      .filter(route => !NOT_DOCUMENTED.has(route.path))
      .filter(route => !(route.path in doc.paths))
      .map(route => `${route.path}  (${route.api}/routes/${route.file})`)

    // A new custom route in a sibling routes file is invisible to Swagger
    // unless it is added to custom-routes.ts. This is what says so.
    expect([...new Set(missing)]).toEqual([])
  })

  it('covers the credential endpoints the empty router hid', () => {
    // api/credential/routes/credential.ts is `{ routes: [] }`, so the plugin
    // generated nothing whatsoever for credentials - not even the CRUD.
    for (const expected of [
      '/credentials',
      '/credentials/{id}',
      '/credentials/{id}/verify',
      '/credentials/{id}/certificate',
      '/credentials/issue',
      '/credentials/batch-issue',
      '/credentials/{id}/revoke',
    ]) {
      expect(Object.keys(doc.paths)).toContain(expected)
    }
  })

  it('documents the certificate formats', () => {
    const params = (doc.paths as any)['/credentials/{id}/certificate'].get.parameters
    const format = params.find((p: any) => p.name === 'format')

    expect(format.schema.enum).toEqual(['svg', 'png', 'pdf'])
    expect(format.schema.default).toBe('svg')
  })

  it('uses OpenAPI path templating, not Strapi route syntax', () => {
    for (const key of Object.keys(doc.paths)) {
      expect(key).not.toMatch(/:[A-Za-z]/)
      expect(key.startsWith('/')).toBe(true)
    }
  })

  it('gives every operation a tag, a summary and responses', () => {
    const problems: string[] = []

    for (const [key, item] of Object.entries(doc.paths as Record<string, any>)) {
      const operations = Object.entries(item).filter(([method]) => HTTP_METHODS.includes(method))

      if (!operations.length) {
        problems.push(`${key} declares no HTTP method`)
        continue
      }

      for (const [method, operation] of operations as [string, any][]) {
        const where = `${method.toUpperCase()} ${key}`
        if (!operation.tags?.length) problems.push(`${where}: no tag`)
        if (typeof operation.summary !== 'string') problems.push(`${where}: no summary`)
        if (!operation.responses?.['200']) problems.push(`${where}: no 200 response`)
      }
    }

    expect(problems).toEqual([])
  })

  it('declares a path parameter for every templated segment', () => {
    const problems: string[] = []

    for (const [key, item] of Object.entries(doc.paths as Record<string, any>)) {
      const templated = [...key.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(m => m[1])
      if (!templated.length) continue

      for (const [method, operation] of Object.entries(item) as [string, any][]) {
        if (!HTTP_METHODS.includes(method)) continue

        const declared = (operation.parameters ?? [])
          .filter((p: any) => p.in === 'path')
          .map((p: any) => p.name)

        for (const name of templated) {
          if (!declared.includes(name)) {
            problems.push(`${method.toUpperCase()} ${key}: undeclared path param ${name}`)
          }
        }
      }
    }

    expect(problems).toEqual([])
  })

  it('carries no info block, which would gate it on a version match', () => {
    // The plugin skips an override whose info.version differs from the version
    // being generated, so omitting info entirely is what keeps it applying.
    expect((doc as any).info).toBeUndefined()
  })
})
