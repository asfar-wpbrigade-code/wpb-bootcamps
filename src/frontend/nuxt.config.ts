// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtConfig } from 'nuxt/config'

/**
 * Where this app is served. Everything that has to name the site to the
 * outside world - canonical links, the sitemap, OG URLs, certificate QR
 * codes - comes from here, so there is one value to change when the domain
 * does, and no page can disagree with another about what site it belongs to.
 *
 * This is the certificate platform's own host, not wpbrigade.com: the
 * marketing site is a different origin, and claiming its URL as canonical
 * told Google every page here was a duplicate of a page there.
 */
const SITE_URL = (process.env.NUXT_PUBLIC_WEBSITE_URL || 'https://bootcamp.labspk.com')
  .replace(/\/+$/, '')

export default defineNuxtConfig({
  compatibilityDate: '2025-06-12',
  devtools: { enabled: true },
  modules: [
    '@nuxt/test-utils/module',
    '@nuxtjs/color-mode',
    '@pinia/nuxt',
    '@una-ui/nuxt',
    '@unocss/nuxt',
    'nuxt-svgo',
    '@nuxt/image',
    '@nuxt/icon',
    ['nuxt-gtag', {
      id: process.env.NUXT_PUBLIC_GA4_ID || '', // No ID = no analytics sent
      config: {
        anonymize_ip: true,
        send_page_view: true
      },
      debug: false
    }],
    // @nuxtjs/sitemap v7. `hostname`, `staticRoutes`, `gzip` and
    // `trailingSlash` were v5 option names: v7 ignores unknown keys silently,
    // so the previous config did nothing at all and the module fell back to
    // listing every prerenderable page - /dashboard, /login, /profile and
    // /issue included, each of which robots.txt disallows in the same breath.
    // The site's URL now comes from `site.url` below.
    ['@nuxtjs/sitemap', {
      // An exclude list rather than an allow list: a new public page should
      // be found on its own, and forgetting to add one costs traffic, while
      // forgetting to exclude a private one is what happened here.
      exclude: [
        '/dashboard',
        '/profile',
        '/issue',
        '/scheduled',
        '/login',
        '/forgot-password',
        '/reset-password',
        '/auth/**',
        // Individual certificates stay publicly reachable - that is the point
        // of a verifiable credential, and a link or QR code still resolves
        // for anyone - but listing them submitted every recipient's name to
        // search engines. Being verifiable by whoever holds the link is not
        // the same as being findable by name, and recipients never chose the
        // latter. The pages send `noindex` to match; see pages/credentials/[id].
        '/credentials/**',
      ],
      sortEntries: true,
    }],
  ],
  svgo: {
    autoImportPath: './assets/svg/'
  },
  colorMode: {
    preference: 'light',
    fallback: 'light',
  },
  icon: {
    serverBundle: {
      collections: ['heroicons', 'lucide', 'radix-icons', 'simple-icons', 'tabler']
    }
  },
  unocss: {
    // UnoCSS configuration
    preflight: true,
    icons: {
      scale: 1.2,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    },
    // Nothing to safelist. The previous entries were the upstream project's
    // demo sponsor logos (Netflix, Fitbit, Airbnb, Uber...); no component
    // renders them, and shipping other companies' marks on a page of ours
    // would imply a relationship that does not exist.
    safelist: []
  },
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'manifest', href: '/site.webmanifest' },

        { rel: 'sitemap', type: 'application/xml', href: '/sitemap.xml' },
        { rel: 'describedby', type: 'text/plain', href: '/llms.txt' },

        // No site-wide canonical: one href here applies to every route, so
        // it can only ever be right for one of them. Each page sets its own
        // from useSiteUrl().
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap'
        },
      ],
      script: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            'name': 'WPBrigade',
            'description': 'WPBrigade platform for issuing, managing, and verifying digital credentials based on Open Badges 3.0 and W3C Verifiable Credentials.',
            'url': SITE_URL,
            'applicationCategory': 'BusinessApplication',
            'operatingSystem': 'Linux, macOS, Windows',
            'author': {
              '@type': 'Organization',
              'name': 'WPBrigade',
              'url': 'https://wpbrigade.com',
            },
            'featureList': [
              'Digital credential issuance',
              'Open Badges 3.0 verification',
              'W3C Verifiable Credentials',
              'Credential revocation',
              'Self-hosted Docker and Kubernetes deployment',
            ],
          }),
        },
      ],
      htmlAttrs: {
        // lang is updated dynamically per-request in app.vue via useHead()
        lang: 'en'
      }
    }
  },
  // Read by nuxt-site-config, which @nuxtjs/sitemap uses to build absolute
  // URLs. Without it the module infers the origin from whatever host the
  // request arrived on.
  //
  // This one is baked at build time. `public.websiteUrl` below can also be
  // overridden at runtime (Nuxt maps NUXT_PUBLIC_WEBSITE_URL onto it), so a
  // deployment that changes only that variable would move every canonical
  // link and leave the sitemap behind. Set NUXT_SITE_URL to the same value,
  // or rebuild, if the domain is ever changed without touching this file.
  site: {
    url: SITE_URL,
    name: 'WPBrigade Certificates',
  },
  routeRules: {
    // There is no sign-up page any more - an account comes from being issued a
    // certificate (see config/plugins.ts' allow_register). The route is kept as
    // a redirect rather than left to 404 because it was live, indexable and
    // linkable for months, and /login is where anyone arriving on it needs to
    // end up. 301, because it is not coming back.
    '/register': { redirect: { to: '/login', statusCode: 301 } },
  },
  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL,
      // Overridable at runtime, unlike a build-time constant - see SITE_URL
      // above and composables/useSiteUrl.ts.
      websiteUrl: SITE_URL,
      brandName: process.env.NUXT_PUBLIC_BRAND_NAME || 'WPBrigade',
      brandLogoUrl: process.env.NUXT_PUBLIC_BRAND_LOGO_URL || '/wpbrigade-logo.png',
      brandPrimaryColor: process.env.NUXT_PUBLIC_BRAND_PRIMARY_COLOR || '#3458eb',
      brandLinkedInOrganizationId: process.env.NUXT_PUBLIC_BRAND_LINKEDIN_ORGANIZATION_ID || '',
    }
  },
  imports: {
    dirs: ['stores', 'constants'],
  },
  css: [
    '~/assets/css/main.css',
  ],
  plugins: [
    '~/plugins/api.ts',
    '~/plugins/auth.ts',
    // The auth-init plugin is client-only and will be auto-imported.
    // The i18n plugin is gone: it detected a browser language and picked the
    // closest match, and the site now ships in English only.
  ],
})
