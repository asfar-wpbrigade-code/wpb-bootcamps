# Known Issues & Dev Notes

Things found while documenting the system that are broken, stubbed, inconsistent,
or otherwise worth knowing before making claims (production-readiness,
security, "how does X work") elsewhere. Grouped by severity/theme, not by file.

Items marked **[Fixed]** were corrected after this was first written — kept
here (rather than deleted) so the history/rationale isn't lost, since
several of them are the kind of thing that tends to silently regress.

"Phase 1", where items below refer to it, is the enterprise-readiness phase of
the upstream Certo project's roadmap. That file is not part of this fork, and
two items used to link to a `roadmap.md` that has never existed here; the phase
is closed out either way (see items 30 and 31), so the references are left as
history rather than pointing anywhere.

## Security-relevant

1. **[Fixed] Credential proof verification is now cryptographic
   for locally-issued credentials.** `verification.ts`'s `verifyProof()` used
   to only check structural fields, never the actual signature. It now fetches
   the issuer's public key (`api::profile.issuer-keys`' `getPublicKey()`) and
   calls `jose.jwtVerify(proof.jws, publicKey)`, failing on any mismatch,
   missing key, or malformed JWS. See
   [open-badges.md](./open-badges.md#verification). This does **not** cover
   externally-submitted credentials — see item 4.

2. **[Fixed] Signing no longer silently degrades if the key is
   missing.** `credential.ts`'s `generateProof()` used to catch any signing
   error and fall back to a fake `proofValue` instead of failing the
   issuance. Now that keys are generated automatically per issuer
   (`api::profile.issuer-keys`), the original failure mode (a missing global
   env var) can't happen, and any other signing error now propagates and
   fails the issuance instead of silently producing an unsigned "signed"
   credential.

3. **[Partially superseded] The old global Ed25519 dev keypair
   committed to the repo** (`ed25519-private.pem` / `ed25519-public.pem` at
   the repo root) and `docker-compose.yml`'s hardcoded default for
   `ED25519_PRIVATE_KEY_PKCS8` are now **unused** — signing uses per-issuer
   keys generated automatically (see item 1/2 and
   [open-badges.md](./open-badges.md#signing)) and encrypted at rest via a
   new `ENCRYPTION_KEY`-derived AES-256-GCM key (`utils/key-encryption.ts`).
   The `.pem` files were removed (Aug 2026 cleanup); the
   `ED25519_PRIVATE_KEY_PKCS8` env var in `docker-compose.yml` is **kept**
   for legacy support so old container environments referencing it don't
   error, even though no code path reads it any more.
   `ENCRYPTION_KEY` itself has the same "make sure production generates its
   own, don't reuse the dev default" caveat the old key had.

4. **[Fixed] External-credential proof verification is now
   cryptographic.** `open-badge.ts`'s `validateExternalCredential()` no
   longer sets `const proofVerified = true` unconditionally. It now calls
   `verifyExternalProof()`, which resolves the issuer's verification method
   (local profile URL, remote HTTP(S) key document, or `did:web`/`did:key`),
   fetches the public key, and cryptographically verifies the JWS signature
   with `jose.jwtVerify`. See
   [open-badges.md](./open-badges.md#verification).

5. **[Fixed] Controller actions no longer bypass Strapi's permission
   system in code.** `credential.issue` no longer sets
   `ctx.state.auth = { strategy: { name: 'public' } }` to disable the auth
   check — auth is enforced by the route config instead (mutating routes
   use users-permissions). `achievement.create` and `createAchievement`
   now call `super.create(ctx)` through the core controller (which enforces
   Strapi RBAC) rather than calling `strapi.entityService.create()` directly
   to bypass permission checks. All three actions continue to record an
   `audit-log-entry` with the real caller's user ID, so "who did this" is
   recoverable — see [security.md](./security.md#authorization).
   Audit log coverage was also expanded (Aug 2026) to include
   `credential.import`, `credential.import-open-badge`,
   `credential.batch-issue`, `credential.renew`, `achievement.delete`,
   and `profile.delete-data` (GDPR erasure).

6. **[Fixed] Revocation lists are now wired into issuance,
   revocation, serialization, and verification.** Previously the entire
   `revocation-list` subsystem was dead code — `checkCredentialStatus`,
   `checkStatusInList`, `createStatusListCredential`, and
   `revokeCredentialInStatusList` had zero callers, and there was no field
   linking a credential to a slot in any list at all. Now: `credential.ts`'s
   `issue()` assigns a slot in the issuer's list (creating one on first
   use), the revoke controller flips that slot too, `open-badge.ts` emits a
   `credentialStatus` (StatusList2021Entry) object in the serialized OBv3
   JSON, and `verification.ts` also checks the list alongside the `revoked`
   boolean. `checkStatusInList` was a simplified comma-separated-indices
   implementation rather than a real GZIP+base64 bitstring, and the list was
   not published anywhere a third party could fetch it; both are now done —
   see item 43. See [open-badges.md](./open-badges.md) and
   [strapi-and-credentials.md](./strapi-and-credentials.md).

## Correctness / config bugs

7. **[Fixed] `SMTP_*` env vars had no effect.**
   `src/backend/config/plugins.ts` hardcoded Ethereal SMTP credentials
   directly in source instead of reading from env, so
   `docker-compose.yml`'s `SMTP_HOST=mailhog`/`SMTP_PORT=1025` silently did
   nothing. Fixed by reading `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/
   `SMTP_PASSWORD`/`SMTP_FROM`/`SMTP_REPLY_TO`/`SMTP_SECURE`/`SMTP_REQUIRE_TLS`
   from env (matching the names already used in `.env.example`), with the
   previous hardcoded Ethereal values kept as defaults for anyone who hasn't
   set the vars. `requireTLS` now defaults to `false` rather than `true`,
   since Mailhog (the Docker Compose dev SMTP target) doesn't support
   STARTTLS — Ethereal still works fine with it unset since nodemailer
   upgrades to STARTTLS opportunistically when the server offers it. The
   pre-existing (separately hardcoded) `SMTP_FROM_EMAIL` env var name used by
   `users-permissions.advanced.email_reset_password` was also corrected to
   `SMTP_FROM`, matching `.env.example`.

8. **[Fixed] Backend Dockerfile booted in dev mode.**
   `src/backend/Dockerfile` built with `npm run build` but started the
   container with `CMD ["npm", "run", "develop"]` (Strapi dev mode), and
   overwrote `config/middlewares.js` with a minimal placeholder during the
   build step, discarding the real CORS/CSP config from
   `config/middlewares.ts`. Fixed: the middlewares-overwrite step was removed
   and `CMD` now runs `npm run start`.

9. **[Fixed] `src/bootstrap.ts` was entirely dead code, not a
   second active implementation.** The original note here described this as
   "two parallel permission-bootstrap implementations." On closer inspection,
   Strapi 5 only auto-loads `src/index.ts` as the app's `register`/`bootstrap`
   lifecycle hooks — and `index.ts` only imports from
   `./bootstrap/seed-data` and `./bootstrap/permissions-setup`. The
   standalone `src/bootstrap.ts` (with `setupPublicPermissions`,
   `setupAuthenticatedPermissions`, `forceEnableEndpoints`,
   `enableAllAuthenticatedPermissions`, `setupIssuerPermissions`) was never
   imported by anything and never ran. Its one piece of functionality nothing
   else covered — issuer-role permissions — was ported into
   `bootstrap/permissions-setup.ts` as a new `ISSUER_PERMISSIONS` list, wired
   through the existing `setupRolePermissions(strapi, 'issuer', ...)` call.
   `src/bootstrap.ts` was then deleted. Also deleted:
   `src/backend/src/bootstrap/permissions-setup.js`, a stale, incomplete
   (public-permissions-only) JS duplicate of `permissions-setup.ts` that
   wasn't the file `index.ts` actually imports — `permissions-setup.ts` is now
   the single source of truth for permission bootstrapping.

10. **[Fixed] `notification.ts`'s `sendBadgeIssuedEmail` was dead
    code.** It built a richer email (with an inline certificate image) but
    was never called anywhere in the codebase — confirmed by search. The real
    issuance flow (`credential.ts`) uses a plainer template
    (`templates/credential-issuance.ts`). The file was deleted rather than
    wired in, since reviving it is a design decision (which template should
    "win," and whether embedding a base64 certificate image in every
    issuance email is desirable) better made deliberately later, not as
    part of this cleanup.

11. **[Fixed] Credential route overlap consolidated.**
    The three files previously defining credential routes were
    `credential-public.ts`, `credential-custom.ts`, and
    `credential-fallback.ts`:
    - `credential-custom.ts` previously exposed `export`, `import`, and `revoke`
      as `auth: false` public routes — a security issue (Aug 2026). Deleted;
      consolidated into `credential-public.ts` with proper auth config
      (users-permissions on mutating routes, `auth: false` on read/verify/validate).
    - `credential-fallback.ts` — kept as a last-resort legacy safety net
      for public credential listing (`GET /api/credentials`). Its route
      (`/api/credentials`) is a subset of `credential-public.ts`'s
      listing route; it provides backward compatibility for integrations
      that depend on the standalone file.
    - `credential-public.ts` — now the single source of truth for all
      unauthenticated credential endpoints. Contains 7 routes (listing,
      detail, verify, validate, certificate, direct-certificate) all with
      explicit `auth: false`, and no `auth: false` on mutating operations.
    All three have been consolidated with the security gap closed and
    backward compatibility preserved.

    See `src/backend/src/api/credential/routes/credential-public.ts`,
    `src/backend/src/api/credential/routes/credential-custom.ts` (deleted),
    `src/backend/src/api/credential/routes/credential-fallback.ts`.

## Doc / metadata inconsistencies

12. **[Fixed] License conflict.** Root `LICENSE` is AGPL-3.0 (and
    the README agrees) — confirmed as the correct license going forward.
    `docs/fresh-install-implementation.md`, `scripts/fresh-install.sh`,
    `src/backend/scripts/fresh-install.js`, and
    `src/backend/scripts/README.md` all previously claimed MIT (including two
    places where the *running script itself* printed "This project is
    licensed under the MIT License" to the console) — all four were corrected
    to reference AGPL-3.0.

13. **[Fixed] Aligned the two seeding mechanisms to use the same admin
    credentials.** The original note here correctly identified a UX footgun:
    `seedDevelopmentData()` (auto-running on first `docker-compose up`)
    creates `admin@certo.com`/`certo`, while `fresh-install.js` (manually
    invoked via `npm run fresh-install`) created `admin@certo.com`/`Admin123!`.
    Since both can run against the same database, the "current" admin password
    depends on order of operations.
    Fixed (Aug 2026) by making `fresh-install.js`'s admin password
    match `seed-data.ts` (`admin@certo.com`/`certo`). The issuer user
    (`issuer@certo.com`/`Issuer123!`) remains the distinguishing feature of
    the fresh-install path. The two-mechanism architecture itself is kept —
    one auto on server start, one manual for richer setup — since each serves
    a different use case.

14. **[Fixed] `CONTRIBUTING.md` referenced a `frontend/` directory**
    that doesn't exist (it's `src/frontend/`) and a backend `npm test` script
    that didn't exist at the time (it does now — see #19). Both corrected.

15. **[Fixed] `.cursorrules` (repo root) has been deleted** — it was
    an unedited generic template describing an unrelated Next.js 15/React 19
    stack. The `.gitignore` already had `.cursorrules` so it was never tracked;
    the file was removed from disk. `.cursor/rules/vue.mdc` remains the
    relevant one (Nuxt3/Vue3/UnoCSS/UnaUI/Strapi5).

## Minor / cleanup

16. **[Fixed] The scaffold directories at `src/frontend/src/frontend/` and
    `src/frontend/src/frontend-una/` were already absent on inspection
    (Aug 2026). No action needed.**

17. **[Fixed] `netlify/functions/og-credential/` node_modules is properly
    gitignored** via the root `.gitignore`'s `node_modules/` pattern. Confirmed
    by `git check-ignore -v --no-index`. No `node_modules` currently present.

18. **[Fixed] `nuxt-gtag` GA4 measurement ID is now env-driven.**
    Replaced with `process.env.NUXT_PUBLIC_GA4_ID` (defaults to `''`, sending
    no analytics when unset). See `src/frontend/nuxt.config.ts`.

19. **[Fixed] Backend now has a Jest suite and both apps run in
    CI.** Coverage is intentionally narrow (unit tests for the new/changed
    crypto logic — `key-encryption.ts`, `issuer-keys.ts`,
    `verification.ts`'s `verifyProof()` — not a full Strapi-integration test
    suite; see [architecture.md](./architecture.md#testing)).
    `.github/workflows/ci.yml` runs backend type-check/test/build and
    frontend test/build on push/PR to `main`, alongside the pre-existing
    `frontend/autofix.yml`. Playwright E2E still isn't run in CI. Broader
    backend test coverage (controllers, other services) remains a good
    follow-up.

20. **[Fixed] `strapi.log.error()`/`.warn()` only print their first
    argument.** Unlike `console.error`, Strapi's Winston-based logger
    doesn't concatenate/print additional arguments — every
    `strapi.log.error('message:', error)` call in the codebase (seed data,
    permission setup, credential issuance error handlers, the upload
    service) was silently discarding the actual error, so a real failure
    in any of these paths would show up in logs as e.g.
    `[Seed] Error seeding development data:` with nothing useful after it.
    Fixed by interpolating error details directly into the log message.
    Confirmed by simulating a failure before/after the fix. If you add a
    new `strapi.log.*` call, pass one interpolated string, not multiple
    arguments.

## Self-hosting

Found and reported via a real self-hosted deployment attempt —
[issue #78](https://github.com/Schroedinger-Hat/certo/issues/78) is the full
deployment log; #75/#76/#77 below are the three concrete bugs split out of it.
The Dockerfile dev-mode issue also reported there was already covered by
item 8 above.

21. **[Fixed] CORS middleware crashed (`originList.split is not a
    function`) for any origin not on the hardcoded whitelist**
    ([#75](https://github.com/Schroedinger-Hat/certo/issues/75)).
    `config/middlewares.ts`'s `strapi::cors` origin function returned `false`
    for unrecognized origins, but `@strapi/core`'s cors middleware
    unconditionally calls `.split(',')` on whatever the function returns -
    `false` isn't a string or array, so every request from a non-whitelisted
    origin threw internally. Fixed by returning `''` instead (the sentinel
    `@koa/cors`/Strapi's wrapper already use internally for "no match"), and
    by making the whitelist extensible via a new `CORS_ALLOWED_ORIGINS`
    env var (comma-separated) so self-hosters don't have to edit source to
    deploy on their own domain.

22. **[Fixed] `GET /api/users/me?populate=*` returned 403, breaking
    any frontend logic depending on the user's role**
    ([#76](https://github.com/Schroedinger-Hat/certo/issues/76)). Strapi's
    built-in `me` controller (`@strapi/plugin-users-permissions`) runs the
    requested `populate` through `strapi.contentAPI.validate.query`, which
    doesn't allow `role` by default - so the request was rejected before ever
    checking the (correctly configured) Authenticated-role permissions. Fixed
    with a `strapi-server.ts` extension
    (`src/extensions/users-permissions/strapi-server.ts`) that overrides `me`
    to fetch the role directly via `strapi.db.query(...).findOne({ populate:
    ['role'] })`, bypassing that unrelated validation layer, and manually
    strips the private fields (`password`, `resetPasswordToken`,
    `confirmationToken`) that the default controller's sanitizer would have
    removed.

23. **[Fixed] Frontend checked a Strapi role called "Issuer" that
    can never exist, making `/issue` unreachable for everyone**
    ([#77](https://github.com/Schroedinger-Hat/certo/issues/77)).
    `stores/auth.ts`'s `isIssuer` checked `user.role.name === 'issuer'` - the
    Strapi Users & Permissions role - but a fresh instance only ever has the
    built-in `Public`/`Authenticated` roles; issuer-ness is actually the
    `Profile.profileType` field (`Issuer`/`Recipient`/`Both`). Fixed to check
    `profile.value?.profileType` instead. This depended on item 22 being
    fixed first in practice, since without it `/api/users/me` calls that
    populate `role` 403 during session restore.

24. **New: boot-time warning if the seeded default admin credentials
    are still active.** #78 flagged that `admin@certo.com`/`certo` (the
    README's documented dev credentials) end up live in production
    deployments that don't explicitly set `NODE_ENV=production` (the only
    thing that makes `seedDevelopmentData()` skip seeding). Added
    `bootstrap/default-credentials-warning.ts`, run unconditionally on every
    boot (not gated by environment): if `admin@certo.com` exists and its
    password still validates against the seeded default, it logs a loud
    `strapi.log.warn` block. This is advisory only — it doesn't rotate the
    password or block startup, since a self-hoster may be mid-setup.

## Enterprise readiness: Import/Export, Backup/Restore, Monitoring

Continues the audit log + RBAC work above (item 5) — multi-tenancy remains
deliberately deferred (see item 5's rationale) — with three more
production-readiness items: self-service data portability, full-instance
backup/restore, and basic monitoring.

25. **New: self-service data export/import, per profile.**
    `api::profile.profile`'s new `exportMyData`/`importMyData` actions
    (`GET`/`POST /profiles/me/export`, `/profiles/me/import`) let an
    authenticated issuer take *all* their own data with them - achievements
    they created, credentials they issued or received, and evidence - as one
    JSON bundle, and re-import it (achievements/credentials they issued
    only, never `credentialsReceived`) into a fresh instance under the same
    account. Distinct from the pre-existing
    `credential.import`/`credential.export` actions and
    `open-badge.ts`'s `importCredential()`, which handle ingesting/emitting a
    single *externally-issued* OB3 VC - naming was deliberately kept
    separate to avoid confusing the two. Import is idempotent: achievements/
    credentials/evidence already present (matched by their natural unique
    key - `achievementId`/`credentialId`/`evidenceId`) are skipped, never
    duplicated or overwritten. Implementation:
    `api/profile/services/data-portability.ts`; recipient resolution reuses
    `credential.ts`'s find-or-create-by-email logic, extracted into its own
    `findOrCreateRecipientProfile()` method rather than duplicated.

26. **New: full-instance backup/restore (`npm run backup`/`restore`).**
    DB-native rather than a generic content-type JSON dump - `pg_dump`/
    `pg_restore` for Postgres, a plain file copy for sqlite - plus
    `public/uploads`, all into one timestamped directory under `backups/`
    (gitignored). Deliberately does **not** boot a full Strapi instance like
    `scripts/fresh-install.js` does: backup/restore only need the raw
    `DATABASE_*` connection config (read the same way
    `config/database.ts` does, via `dotenv`), not the ORM - and for sqlite
    specifically, booting Strapi would mean holding the very DB file open
    that restore is about to overwrite. `restore.js` refuses to run without
    an explicit `--yes` (it's destructive: `pg_restore --clean --if-exists`
    drops existing objects first; sqlite restore overwrites the live file
    outright). MySQL isn't supported - nothing in this repo's docker-compose/
    docs uses it. The backend `Dockerfile` now installs
    `postgresql16-client` (matching the `postgres:16` image in
    `docker-compose.yml`) so `docker exec certo_backend npm run backup`
    works without extra setup.

27. **[Fixed] `docker-compose.yml`'s `backend` service had no volume
    for `public/uploads` at all.** Every container recreation silently
    deleted all uploaded media (achievement/profile images) - found while
    scoping what a backup actually needs to capture, since there was nothing
    durable to back up otherwise. Fixed by adding a named `uploads-data`
    volume mounted at `/app/public/uploads`.

28. **New: monitoring (`/api/health`, `/api/metrics`).** `/api/health`
    is a richer JSON DB-connectivity check than Strapi's built-in `/_health`
    (204, no body), which is unchanged and still present. `/api/metrics` is
    a `prom-client`-backed Prometheus endpoint: default Node process metrics
    plus four counters (`certo_credentials_issued_total`,
    `certo_credentials_revoked_total`,
    `certo_credentials_verified_total{result}`,
    `certo_achievements_created_total`) incremented at the same call sites
    already touched by item 5's audit log. Both routes are unauthenticated
    by design (Prometheus/health-check convention, same as `/_health`) -
    self-hosters should restrict `/api/metrics` at the reverse proxy, not
    app auth. Neither is tied to a content type, so both are registered via
    `strapi.server.routes()` inside `src/index.ts`'s `register()` hook
    rather than a fake content-type-less `api/` folder - this has to happen
    in `register()`, not `bootstrap()`, since Strapi finalizes routing
    (`server.initRouting()`) partway through its own `bootstrap()`, before
    this app's `bootstrap({ strapi })` hook ever runs. See
    [monitoring.md](./monitoring.md).

29. **New: structured logging (`LOG_FORMAT_JSON`) with per-request
    correlation.** Closes out the last open Enterprise Readiness item
    (multi-tenancy remains deliberately deferred per item 5). New
    `config/logger.ts` — Strapi's standard "every file in `config/` becomes
    a config key" convention, no monkey-patching — switches from the default
    colored `prettyPrint()` to `winston.format.json()` when
    `LOG_FORMAT_JSON=true`, off by default so local dev is unaffected. A new
    `src/middlewares/request-id.ts` (`global::request-id`, first in
    `config/middlewares.ts` so its context covers the whole request
    lifecycle) assigns a correlation id per request and runs the rest of the
    chain inside an `AsyncLocalStorage` context
    (`src/utils/request-context.ts`); `config/logger.ts`'s format reads that
    same store and attaches `requestId` to **every** log line produced
    during the request — including `strapi::logger`'s own access-log line —
    with no changes needed to any of the ~40 existing `strapi.log.*()` call
    sites (item 20's single-interpolated-string convention is untouched).
    See [logging.md](./logging.md).

30. **New: Helm chart + reverse-proxy examples.** Closes Phase 1's
    remaining deployment items (`docs/architecture.md` previously stated
    plainly that no Kubernetes manifests, Helm charts, or Terraform existed
    - Terraform remains genuinely out of scope, a separate Phase 4 item).
    New `.github/workflows/docker-publish.yml` builds and pushes
    backend/frontend images to `ghcr.io/schroedinger-hat/certo-{backend,
    frontend}` on push to `main` and on version tags, using the workflow's
    own `GITHUB_TOKEN` (no new secrets). New `helm/certo/` mirrors
    `docker-compose.yml`'s services/env vars exactly rather than inventing
    a different shape: an optional bundled Postgres (a plain StatefulSet,
    not a Bitnami chart dependency, to avoid taking on an external chart's
    version churn), a PVC for uploads matching the docker-compose volume
    from item 27, readiness/liveness probes on `/api/health` (item 28's
    recommended target), and secrets that auto-generate on first install
    and persist across `helm upgrade` via Helm's `lookup` function so
    upgrading never rotates a running instance's credentials out from under
    it (verified end-to-end against a real local `kind` cluster - install,
    confirm `JWT_SECRET` byte-identical after `helm upgrade`, confirm the
    single-replica-Postgres StatefulSet reaches `Running` and its PVC
    binds). Also new: `docs/examples/nginx.conf.example`,
    `Caddyfile.example`, and a Traefik docker-compose label overlay for the
    non-Kubernetes deployment path. See [kubernetes.md](./kubernetes.md) and
    [reverse-proxy.md](./reverse-proxy.md).

31. **New: `/api/v1` versioning, closing out Phase 1.** Previously
    documented as "deliberately deferred since it's a breaking change to
    every route the frontend calls" (`docs/backend.md`) - that framing
    assumed versioning meant migrating every route/consumer at once. It
    doesn't: Strapi mounts its entire content-API router under one global
    prefix (`config/api.ts`'s `rest.prefix`, read at
    `@strapi/core/dist/services/server/content-api.js:7`), so every route
    already shares a single prefix with no per-file registration. New
    `src/middlewares/api-version-alias.ts` (`global::api-version-alias`,
    first in `config/middlewares.ts`) rewrites an incoming `/api/v1/*` path
    to `/api/*` before Strapi's router matches it (confirmed via Koa's own
    `ctx.path` setter that this correctly updates the underlying URL,
    preserving the query string, for `@koa/router` to re-match) - so
    `/api/v1/*` becomes a transparent, zero-maintenance alias for every
    current *and future* route, with `/api/*` continuing to work unchanged
    since the frontend (`api-client.ts`) and the Netlify OG-image function
    both hardcode literal `/api/...` paths and were deliberately left
    untouched. See [backend.md](./backend.md).

32. **New: S3-compatible upload provider.** `config/plugins.ts`'s
    `upload.config` was hardcoded to `provider: 'local'` - the only storage
    option, and a real problem for the Helm chart from item 30, whose
    `backend.uploads` PVC is `ReadWriteOnce` and can't be shared across
    `backend.replicaCount > 1`. New `UPLOAD_PROVIDER=s3` env var switches to
    `@strapi/provider-upload-aws-s3` (added as a dependency); confirmed by
    reading the package's own README and `dist/index.js` (not guessing) that
    its `providerOptions.s3Options` is spread directly into `new S3Client()`,
    so `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE` (unset for real AWS) make it work
    with any S3-compatible service, exactly as the package's own "S3
    compatible services" doc section describes for Scaleway. No CSP change
    needed - `config/middlewares.ts`'s `img-src`/`media-src` already include
    a bare `*`. Verified end-to-end against a real local MinIO container
    (not just config review): uploaded a file through Strapi's actual
    upload API, confirmed the object landed in the bucket, and confirmed
    the returned URL served the exact uploaded content back; also confirmed
    `UPLOAD_PROVIDER` unset still uses local disk exactly as before. See
    [self-hosting.md](./self-hosting.md#or-skip-local-disk-entirely-s3-compatible-storage).

33. **New: QR codes on certificates.** The backend-generated
    certificate SVG (`GET /credentials/:id/certificate`,
    `utils/certificate-template.ts`) now embeds a QR code (bottom-right
    corner, the one part of the 800x650 layout previously left empty)
    linking to the credential's public verification page, and the frontend
    credential detail page (`pages/credentials/[id]/index.vue`) renders the
    same QR client-side (`onMounted`, matching the existing
    `navigator.share()` pattern). Both use the new `qrcode` npm package
    (added to both `src/backend/package.json` and
    `src/frontend/package.json` independently - no monorepo tooling shares
    dependencies between them). The backend's QR URL is built from
    `strapi.config.get('frontend.url', ...)` (the same self-hosting-aware
    config `credential.ts` already uses for notification emails) +
    `credential.credentialId`, not a hardcoded production URL. Verified
    end-to-end, not just code review: decoded the actual rendered QR from a
    real certificate SVG with a QR decoder library (`jsqr` against a
    `rsvg-convert`-rendered PNG) and confirmed it resolves to the exact
    expected `/credentials/<credentialId>` URL; loaded the frontend detail
    page in a real (Playwright) browser and confirmed the QR renders with a
    valid image and the same URL underneath.

    In passing: the frontend's `shareableUrl` (which this QR reuses) is
    built from a hardcoded `WEBSITE_URL` constant
    (`constants/index.ts`), not an env var - a pre-existing self-hosting
    gap this feature inherits but doesn't fix, since fixing it was out of
    scope here.

34. **New: Multi-tenancy enforcement (user-owned profiles).** Profiles can now
    have an owner user (new `owner_id` FK in `profiles` table, added via
    `database/migrations/2026-08-06_add_profile_owner.js`). The new
    `api::profile.multi-tenancy` service provides 8 methods for scoping
    queries: `getUserProfiles()`, `getUserProfileIds()`, `getUserAchievements()`,
    `getUserCredentials()` (handles both issuer and recipient), `userOwnsProfile()`,
    `userCanAccessCredential()`, `userCanAccessAchievement()`, and
    `getUserEvidence()`. Controllers (profile, credential, achievement) have
    `find()` and `findOne()` overrides that check authentication via
    `ctx.state.user.id` and return 403 if the user doesn't own the
    resource. All queries use `entityService.findMany` with filters on
    profile ID arrays (from `getUserProfileIds`) rather than adding new
    permission middleware, so tenant data isolation is enforced at the
    service/query layer and applies to all endpoints automatically. Tests
    added: 15 unit tests covering all multi-tenancy service methods (mock
    strapi.entityService) and permission checks. The seed data links the
    admin user's profile to that user so local dev multi-tenancy works
    out-of-the-box. This closes the last open item from Phase 2 (Build
    Trust). See
    [self-hosting.md](./self-hosting.md#multi-tenancy-user-owned-profiles) and
    [backend.md](./backend.md#api-structure).

35. **New: Event Bus for async webhook delivery with retry logic.** Decouples
    webhook delivery from credential-issuance endpoints via a pub-sub Event Bus
    with durable retry semantics. Architecture: Provider pattern with two
    implementations — `MemoryEventBus` (in-process queue, 100ms processing
    cycle, exponential backoff retries: 1s/2s/4s, max 3 attempts) for dev/
    single-instance, and `RedisEventBus` (Redis Streams, consumer groups, XACK,
    message persistence, 5s XREADGROUP block) for production/multi-replica.
    Configuration via `EVENT_BUS_PROVIDER` env var (defaults to 'memory'),
    optional ioredis (lazy-loaded, falls back with helpful error if user tries
    redis without it). Integration: webhook dispatcher split into
    `publishEvent()` (called by controllers, returns immediately) and
    `dispatchEvent()` (called by event bus consumer, does actual HTTP delivery
    with signing). Credential controllers (revoke, renew) now call
    `publishEvent()` instead of blocking on webhook dispatch. Tests: 7 new
    Jest tests for MemoryEventBus (publish/consume, ID generation, multiple
    subscribers, error isolation, retry backoff, max retries, cleanup). Docs:
    `.env.example` additions, new Event Bus section in
    [backend.md](./backend.md#event-bus), webhook config section in
    [self-hosting.md](./self-hosting.md#webhook-delivery-and-retries). Fixes the
    "best-effort" webhook problem: endpoints are now retried automatically,
    failed deliveries don't block others, and multi-replica Redis backend gives
    durable retries across server restarts. See
    [backend.md](./backend.md#event-bus) and
    [self-hosting.md](./self-hosting.md#webhook-delivery-and-retries) for
    details.

## Launch hardening (Sep 2026)

Found while going through the app for its public launch. All four were silent:
nothing failed a test, and three of them looked correct in the source.

36. **[Fixed] `nuxt build` failed outright, so no image could be
    deployed.** The frontend production build died with
    `Expected ',', got 'undefined' in node_modules/papaparse/papaparse.js`,
    pointing at a dependency whose source is perfectly valid — it parses
    cleanly through `rollup/parseAst` on its own.

    Nitro's rollup config replaces the *text* `typeof window` with
    `"undefined"` across the entire server bundle
    (`nitropack/dist/rollup/index.mjs`, `@rollup/plugin-replace` with no
    `delimiters`, so string literals are rewritten too). papaparse builds its
    web worker from a source string containing `typeof window`; the
    substitution drops a double quote into the middle of a double-quoted
    string, and the result no longer parses.

    Fixed by keeping papaparse out of the server bundle entirely:
    `parseRecipientsCsv()` imports it dynamically behind `import.meta.client`,
    which compiles to `false` on the server, so the branch is removed rather
    than merely left uncalled. Note that neither a plain dynamic import nor
    `nitro.externals.external` is enough — both still route the file through
    that replace pass. papaparse 5.7.0 (latest) still contains the string, so
    upgrading is not a fix either.

37. **[Fixed] Every page declared wpbrigade.com as its canonical URL.**
    `nuxt.config.ts` set one site-wide `rel=canonical` to
    `https://wpbrigade.com` — a different site from the one being served —
    which tells search engines every page here is a duplicate of a page there.
    The site-wide tag is gone (one href can only be right for one route) and
    each page names itself; `pages/index.vue` had been relying on the global
    one and now sets its own.

38. **[Fixed] The sitemap config had no effect.** `hostname`,
    `staticRoutes`, `gzip` and `trailingSlash` are @nuxtjs/sitemap v5 option
    names; the installed module is v7, which ignores unknown keys silently.
    The public-routes allow list therefore did nothing and the module listed
    every prerenderable page — `/dashboard`, `/login`, `/profile` and `/issue`
    among them, each of which `robots.txt` disallows in the same breath. Now
    an `exclude` list, with the origin coming from `site.url`.

39. **[Fixed] `NUXT_PUBLIC_WEBSITE_URL` was read at build time, not
    runtime.** `constants/index.ts` exported it as a module constant, which is
    inlined into the client bundle when the image is built. The Dockerfile
    builds without that variable, so the value set on the running container
    applied on the server and was ignored in the browser: the same page could
    advertise two different canonical URLs depending on who rendered it. It is
    now `runtimeConfig.public.websiteUrl`, read through `useSiteUrl()`.

    `pages/login.vue` read `NUXT_PUBLIC_OAUTH_PROVIDERS` and
    `NUXT_PUBLIC_API_URL` the same way, and now reads both through
    `useRuntimeConfig()`; `oauthProviders` was added to `runtimeConfig.public`
    to give it somewhere to come from. The first was harmless while OAuth is
    unused and the list is empty. The second was not as harmless as it looks:
    it is the origin the OAuth `connect` redirect is built from, so enabling a
    provider in a container would have sent people to
    `http://localhost:1337/api/connect/...`. Both were inert only because
    nothing turns OAuth on.

## Image build (Sep 2026)

40. **[Fixed] A locally built backend image was 3.63GB and carried
    the development `.env`.** The backend Dockerfile was a single stage ending
    in `COPY . .`, with no `.dockerignore` anywhere in the repository - and
    `.dockerignore` was itself listed in `.gitignore`, which is why there was
    none. Two consequences, both scoped to images built from a working tree:

    * `/app/.env` shipped inside the image - the development `APP_KEYS`,
      `JWT_SECRET`, `ENCRYPTION_KEY` and SMTP password. Compose environment
      variables take precedence at runtime, so nothing misbehaved and nothing
      pointed at it.
    * The host's `node_modules` (1.09GB) was copied over the ones `npm ci` had
      just installed inside the image (1.54GB) - built for a different
      platform, and paid for twice.

    Both files are gitignored, and Dokploy builds from a clone, so the
    *deployed* image never carried either: its `COPY . .` saw tracked files
    only. What the `.dockerignore` files fix is the local build, which is the
    one anybody actually looks at and measures.

    The image is now three stages: a builder with the full tree (the admin
    panel needs the devDependencies to build), a deps stage running
    `npm ci --omit=dev` against the same lockfile, and a runtime stage holding
    the production tree, `dist`, and nothing else. 3.63GB to 1.61GB. The
    frontend's runtime image was already clean - its multi-stage build copies
    only `.output` - but it gained a `.dockerignore` too, which took it from
    316MB to 285MB and stops `.env` reaching even the builder.

    Two things the runtime stage must carry that are easy to miss, both found
    by booting the result rather than by reading it:

    * `tsconfig.json` **and** the TypeScript sources. `strapi start` calls
      `tsUtils.resolveOutDir`, which parses the tsconfig; with no sources for
      its `include` globs to match, TypeScript reports "TS18003: No inputs
      were found in config file" and Strapi treats that as fatal. It does not
      recompile them - `dist` is what runs - and together they are under 2MB.
    * `database/migrations`. They are plain `.js`, so `strapi build` does not
      compile them into `dist`. Leaving them out is silent: the app boots and
      the migration simply never runs.

41. **Where the size actually is, and why 700MB is out of reach.**

    Docker's own numbers disagree with each other here, so compare like with
    like. `docker images` reports the sum of the layer sizes, which
    double-counts a file that a later layer overwrites - that is why the local
    build read 3.63GB while its filesystem held 1.73GB. Measuring
    `du -sx /` inside each image gives one comparable figure:

    | image | filesystem |
    |---|---|
    | old Dockerfile, built from a working tree | 1.73GB |
    | old Dockerfile, built from a clone (what deployed) | 1.63GB |
    | three-stage | 1.21GB |

    The breakdown of that 420MB is not what it looks like from the outside:

    | | old (clone) | three-stage |
    |---|---|---|
    | `/app/node_modules` | 1.1GB | 1.0GB |
    | `/root/.npm` | 383.5MB | gone |

    So the single biggest win was **discarding npm's download cache**, which a
    single-stage build leaves behind and which `npm cache clean --force` or a
    separate stage removes. Dropping devDependencies came to about 100MB,
    because the packages that dominate are Strapi's *runtime* dependencies:
    `@strapi` 276MB, `@swc` 105MB, `@formatjs` 41MB, `date-fns` 33MB,
    `typescript` 31MB, `@types` 25MB, `hls.js` 20MB, `@mux` 18MB, `node-plop`
    17MB. Anyone chasing this further should start from that table, not from
    `docker images`.

    Deleting the build-only ones in the same layer as the install (a later
    `rm -rf` only adds a whiteout - the files stay in the layer below and the
    image does not shrink) takes it to 1.31GB, and the result boots and serves
    both `/api/health` and `/admin`. It is not committed, because those
    packages are Strapi's to require and a lazily-loaded path could still want
    one. Two of them are load-bearing and were only found by trying:
    `typescript`, via `resolveOutDir` above, and `date-fns`, without which the
    server exits at boot with `Cannot find module 'date-fns'`.

    As filesystem sizes: 1.21GB supported, about 0.98GB if you accept the
    unsupported prune, and 700MB not without going inside `@strapi` itself,
    which is 276MB of the total.

## Accounts (Sep 2026)

42. **[Fixed] Self-registration produced an account with no profile.**
    `allow_register` was `true` and `/register` was a live, indexable page, but
    the only code that creates a profile is issuance: `credential.ts`'s `issue()`
    calls `findOrCreateRecipientProfile()` and `findOrCreateUser()` together, in
    that order. Registering through `/api/auth/local/register` created the
    users-permissions user and nothing else.

    Such an account logs in successfully — the JWT is real and the role is
    `authenticated` — and then every page it can reach is empty, because
    `profile.me` resolves the profile by matching `ctx.state.user.email` against
    a **published** profile row and returns 404 when there is none.
    `/dashboard`, `/profile`, the certificate list and `/issue` (which redirects
    to the dashboard without an `Issuer` profileType) all fail that way. Nothing
    told the user why, and nothing distinguished it from having no certificates.

    Fixed by removing the path rather than making it create a profile: an
    account now exists because a certificate was issued to that address.

    **`allow_register: false` in `config/plugins.ts` does not disable
    anything**, and this note first claimed it was the boundary. The
    users-permissions plugin seeds its `advanced` settings into the plugin
    store on a database's first boot and reads the *store* from then on, so the
    stored `true` won and the config edit was silently ignored — exactly the
    trap `bootstrap/email-templates-setup.ts` already documents for the email
    templates. `POST /api/auth/local/register` was still creating accounts with
    the config set to false, and the unit test asserting the config value
    passed the whole time. It was caught by curling the endpoint on a running
    container while verifying an unrelated upgrade, which is the only thing
    that would have caught it.

    `bootstrap/registration-lockdown.ts` is the enforcement: on every boot it
    reads the store and writes `allow_register: false` back if anything has
    turned it on, warning when it does. Every boot rather than once, because
    the setting has a UI — Settings → Users & Permissions → Advanced settings —
    and can be flipped by accident. The config line remains as what a fresh
    database gets seeded with. The endpoint now answers 400 "Register action is
    currently disabled".

    `pages/register.vue` is gone, with its store action, its `AuthClient.register`
    and its orphaned `auth.signUp*` strings; `/register` is a 301 to `/login`
    via `routeRules`, since it was linkable for months. `/login` now renders
    `auth.noAccountYet`, which was already written and had never been mounted
    anywhere — without it the only route in for a recipient who has a
    certificate and has never logged in is "Forgot password?", which does not
    read as the way in.

    Two things this leaves:

    * **Accounts already created this way still exist.** They are not visible as
      broken from the login side, only from the empty dashboard, so
      `scripts/find-profileless-accounts.js` reports them:

      ```
      docker exec certo_backend node scripts/find-profileless-accounts.js
      ```

      It is read-only, and prints for each account whether it holds any
      credentials — which is what decides the remedy. One that does is a real
      recipient whose profile needs fixing; one that holds none is a
      self-registration leftover and can be removed. It also separates "no
      profile row" from "a profile row that was never published", because
      `profile.me` filters on `status: 'published'` and 404s either way, and
      the second only needs the Publish button.
    * **A staff member who is not a recipient now needs both rows made by hand**
      — the User and the Profile, matching on email, the profile published. See
      [Making yourself an issuer](../README.md#making-yourself-an-issuer). That
      is a deliberate trade: hand-made staff accounts are rare, and the
      alternative was a public endpoint that produced a broken account for
      everyone who found it.

## Revocation (Sep 2026)

43. **[Fixed] The status list was not in the format the specification
    describes, and was not published anywhere a verifier could fetch it.**
    Two halves of the same gap, and neither was visible from inside: our own
    `/verify` page decoded the list with `split(',')`, so every test and every
    manual check passed.

    `encodedList` held a comma-separated list of revoked indices. The
    specification says the field is a bitstring — bit N set if entry N is
    revoked — GZIP-compressed and base64url-encoded, padded to a 16KB minimum
    so the list does not disclose how many credentials an issuer has issued.
    A third party who fetched `3,17` could not parse it, and had no way to
    distinguish "cannot read this" from "nothing is revoked".

    It could not fetch it anyway. `credentialStatus.statusListCredential` — the
    field whose entire job is to name the document a verifier dereferences —
    was set to the list's own `urn:uuid:`, which resolves nowhere. A verifier
    was left holding an index and no list to check it in, which is the same
    position as having no revocation mechanism at all.

    Now: `src/utils/status-list.ts` encodes and decodes the bitstring;
    `GET /api/status-lists/:id` serves the list as a signed
    `StatusList2021Credential` (public, `auth: false` — a verifier who has
    never heard of this instance is exactly who it is for, and it carries no
    recipient data); and `statusListCredential` names that URL.

    Four things worth keeping:

    * **The change does not invalidate any signature.** `credentialStatus` is
      assembled in `open-badge.ts` at serialisation and is not part of the
      payload `generateProof()` signed at issuance, so credentials already in
      the wild pick up the new URL and still verify. This was checked against a
      credential issued before the change, not assumed.
    * **Bit order is most-significant-first** — index 0 is `0b10000000` of byte
      0. LSB-first decodes to a *different* set of revoked credentials rather
      than to an error, so it is the kind of mistake that would have shipped.
    * **An unreadable list now fails the check.** `checkStatusInList` used to
      catch everything and return `false`, which reported a credential as valid
      on the strength of a list nobody could read. It throws, and
      `verifyCredential` and `GET /credentials/:id/status` both turn that into a
      visible error.
    * **The old format is still read**, so a restore from a pre-migration
      backup does not break verification. The migration
      (`2026-09-10_encode_status_lists.js`) converts stored lists, and is
      reversible — rolling the app back without also rolling the data back
      would leave the old `split(',')` reader parsing a bitstring, producing
      `NaN` and reporting every revoked credential as valid.

    The migration carries its own copy of the encoder, because migrations are
    plain CommonJS and are not compiled into `dist` (item 40), so it cannot
    import from `src/utils`. `src/utils/__tests__/status-list.test.ts` drives
    the migration and asserts the two produce byte-identical output.

44. **[Fixed] `GET /credentials/:id/status` read a field that has never
    existed.** The handler looked up `list.revokedCredentials[credentialId]` on
    the issuer's most recently updated revocation list. `revokedCredentials` is
    not an attribute of the `revocation-list` content type — it appears only in
    an interface declared in the controller file — so the lookup was always
    `undefined` and the branch always answered "not revoked".

    It agreed with the truth only because the revoke controller sets the
    `revoked` boolean as well, and that is checked first. Anything that flipped
    a bit in the status list alone — the migration, a direct database fix, a
    future bulk revocation — would have been reported as valid by this
    endpoint while `/verify` correctly reported it as revoked. It now consults
    the credential's own slot through `checkStatusInList`, and fails closed on
    a list it cannot read.

## Certificate PDF (Sep 2026)

45. **[Fixed] The PDF was one flat picture, with no text in it at all.**
    `renderCertificatePdf` rasterised the SVG at 4x and drew the PNG onto a
    Letter page. That prints beautifully — about 288 DPI — and contains no
    text: nothing to select, nothing for Ctrl-F, nothing for a screen reader.
    A recipient forwarding a certificate to an employer was sending an image
    of their own name.

    Fixed the way a scanned document is made searchable: the visible page is
    still the same raster, so the design is identical to the PNG and the web
    view, with an invisible text layer (`opacity: 0`) placed over it.

    The interesting part is what the SVG does *not* contain. Two of the strings
    are drawn as vector outlines, and outlines carry no text:

    * the heading, whose face (Engravers Old English BT) is licensed and can
      neither be embedded nor assumed installed;
    * **the recipient's name**, whose script face has the same problem.

    Those are the two a reader is most likely to search for, and neither can be
    recovered from the SVG at any price. They are placed from their known
    metrics instead — `HEADING_METRICS` with a new `HEADING_TEXT` beside it,
    and a new `NAME_METRICS` exported from the template so the position is
    stated once rather than repeated as a literal in two files. The name itself
    is passed in by the caller, which already has it.

    Three things that would have shipped silently, since the layer is invisible
    and every one of them still produces a valid PDF:

    * **`sans-serif` contains "serif".** Testing the whole font stack for
      /serif/ matched `"'Segoe UI', Roboto, Helvetica, Arial, sans-serif"`, so
      the date, the signatory and the credential id were measured in Times.
      The only symptom is a selection rectangle slightly the wrong width.
      Judged by the first family in the stack now, which is the one a renderer
      uses.
    * **SVG y counts down from the top, PDF y counts up from the bottom.**
      Both put the baseline at y, so the conversion is one subtraction — and
      getting it wrong mirrors the layer vertically with nothing to see.
    * **A name outside WinAnsi throws.** The layer is drawn in the standard
      Times/Helvetica, so `drawText` on 李明 would have failed the whole PDF.
      Unencodable characters are dropped from the search layer only; the
      visible certificate renders them correctly, because resvg draws real
      glyphs from the loaded fonts. Embedding a Unicode subset is the proper
      fix, at the cost of a font in every PDF.

    The text is not findable in the PDF's bytes: pdf-lib writes strings as hex
    inside a Flate-compressed content stream. The test inflates the streams and
    decodes the `Tm`/`Tj` pairs, which is also how this was confirmed against
    a certificate served by the running app rather than only in the suite.

    The PNG is unchanged and cannot be fixed the same way — it is a bitmap, and
    there is nowhere in one to put text.
