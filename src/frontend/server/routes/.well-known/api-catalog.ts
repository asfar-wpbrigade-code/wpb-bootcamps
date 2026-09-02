/**
 * GET /.well-known/api-catalog
 *
 * RFC 9727 API Catalog - machine-readable discovery of the REST API.
 * Content-Type: application/linkset+json
 * https://www.rfc-editor.org/rfc/rfc9727
 *
 * No `service-desc` entry: it used to point at
 * /api/documentation/v1.0.0/full_documentation.json, which 404s.
 * @strapi/plugin-documentation is enabled but is not currently serving a
 * generated OpenAPI spec, so there is no machine-readable description to
 * advertise. `service-doc` points at the Swagger UI, which does load.
 */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Type', 'application/linkset+json')
  const api = apiOrigin(event)

  return {
    linkset: [
      {
        'anchor': `${api}/api`,
        'service-doc': [
          {
            href: apiDocsUrl(event),
            type: 'text/html',
            title: 'WPBrigade API documentation (Swagger UI)',
          },
        ],
        'status': [
          {
            href: `${api}/api/health`,
            type: 'application/json',
            title: 'Health check endpoint',
          },
        ],
        // Prometheus metrics
        'https://www.iana.org/assignments/link-relations/monitoring': [
          {
            href: `${api}/api/metrics`,
            type: 'text/plain',
            title: 'Prometheus metrics endpoint',
          },
        ],
      },
    ],
  }
})
