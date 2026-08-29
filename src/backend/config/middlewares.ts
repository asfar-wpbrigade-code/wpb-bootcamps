// Browsers are refused outright unless the page's origin appears here. The
// production domains are listed rather than left to configuration alone: an
// unset environment variable is a silent failure - the site loads and every
// request from it is blocked - and this is the one setting where that costs a
// working login.
//
// Additional origins can still be supplied without editing this file:
// CORS_ALLOWED_ORIGINS=https://staging.example.org,https://other.example.org
//
// The upstream project's own domains (certo.netlify.app,
// certo.schroedinger-hat.org and its Strapi Cloud host) were removed along
// with a wildcard for that project's Netlify deploy previews - anyone opening
// a pull request there would have received an origin this API trusted.
const DEFAULT_ALLOWED_ORIGINS = [
  // Production
  'https://bootcamp.labspk.com',
  'https://bootcamp-api.labspk.com',

  // Local development
  'http://localhost:3000',
  'http://[::1]:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3399',
  'http://localhost:1337',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

export default ({ env }) => {
  const extraAllowedOrigins = env
    .array('CORS_ALLOWED_ORIGINS', [])
    .map((origin: string) => origin.trim())
    .filter(Boolean);

  const isAllowedOrigin = (origin: string) =>
    DEFAULT_ALLOWED_ORIGINS.includes(origin) ||
    extraAllowedOrigins.includes(origin);

  return [
    // Rewrites /api/v1/* to /api/* before anything else sees the path -
    // see src/middlewares/api-version-alias.ts.
    'global::api-version-alias',
    // Next, so its AsyncLocalStorage context covers the entire request
    // lifecycle - including whatever strapi::errors catches. See
    // src/middlewares/request-id.ts and config/logger.ts.
    'global::request-id',
    // Rate limiting & brute-force protection on auth endpoints.
    // See src/middlewares/rate-limit.ts.
    'global::rate-limit',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'connect-src': ["'self'", 'https:', 'http:'],
            'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', 'res.cloudinary.com', 'localhost:1337', '*'],
            'media-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', 'res.cloudinary.com', 'localhost:1337', '*'],
            upgradeInsecureRequests: null,
          },
        },
      },
    },
    {
      name: 'strapi::cors',
      config: {
        origin: (ctx) => {
          const origin = ctx.request.header.origin
          // '' (not false) is the sentinel @strapi/core's cors middleware
          // expects for "no match" - it does `originList.split(',')`
          // unconditionally on whatever this returns, so returning false
          // throws `originList.split is not a function` on every request
          // from a non-whitelisted origin.
          if (!origin || !isAllowedOrigin(origin)) return ''
          return origin
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
        headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
        keepHeaderOnError: true,
        credentials: true,
      }
    },
    'strapi::poweredBy',
    'strapi::logger',
    'strapi::query',
    'strapi::body',
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
  ];
};
