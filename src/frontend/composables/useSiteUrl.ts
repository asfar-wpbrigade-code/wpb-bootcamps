/**
 * The origin this site is served from, for canonical links, OG tags,
 * shareable certificate URLs and the QR codes printed on certificates.
 *
 * Read from runtimeConfig rather than a build-time constant so that
 * NUXT_PUBLIC_WEBSITE_URL set on the running container is honoured by both
 * the server and the browser. The Dockerfile builds the client bundle
 * without that variable, so anything inlined at build time would have kept
 * the default no matter what the deployment said.
 *
 * Trailing slashes are stripped, because every caller appends a path and
 * `https://example.org//about` is a different URL to a crawler.
 */
export function useSiteUrl(): string {
  const configured = useRuntimeConfig().public.websiteUrl

  return String(configured || '').replace(/\/+$/, '')
}
