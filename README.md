# WPBrigade Credentials

[![License: AGPL 3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)
[![Open Badges 3.0](https://img.shields.io/badge/Standard-Open%20Badges%203.0-success)](#standards)
[![W3C VC](https://img.shields.io/badge/Standard-W3C%20Verifiable%20Credentials-success)](#standards)
[![Strapi 5.x](https://img.shields.io/badge/Backend-Strapi%205.x-blue)](https://strapi.io)
[![Nuxt 3](https://img.shields.io/badge/Frontend-Nuxt%203-green)](https://nuxt.com)

The platform WPBrigade uses to issue, manage and verify digital certificates for
its bootcamps and training programmes.

Certificates are cryptographically signed and follow the
[Open Badges 3.0](https://www.imsglobal.org/spec/ob/v3p0/) specification, so a
recipient can prove one is genuine to anyone — an employer, a university, a
client — without asking us to confirm it. Every certificate carries a QR code
leading to a public verification page.

## Contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Issuing certificates](#issuing-certificates)
- [The certificate design](#the-certificate-design)
- [Configuration](#configuration)
- [Backups](#backups)
- [Project structure](#project-structure)
- [Local development without Docker](#local-development-without-docker)
- [API](#api)
- [Testing](#testing)
- [Going to production](#going-to-production)
- [Known limitations](#known-limitations)
- [Built on Certo](#built-on-certo)

## How it works

There are two things to understand, and the rest follows.

**An Achievement is the template.** One per programme — "AI Bootcamp",
"WordPress Development Fundamentals". It holds the name, the description printed
on the certificate, the signatory, the programme dates and the badge artwork.
You create it once.

**A Credential is one issued certificate.** Created each time you award the
template to somebody. It carries an Ed25519 signature, a unique
`urn:uuid:` identifier and a slot in a revocation list.

The flow:

1. An **issuer** creates an Achievement in the Strapi admin panel
2. They issue it from `/issue` — one recipient at a time, or a CSV for a whole cohort
3. Each recipient gets an email with a link to their certificate, and an account
   to view every certificate they hold
4. **Anyone** can verify a certificate at `/verify`, by scanning its QR code, or
   — in the PDF — by clicking the seal, which is a live link to that
   credential's page
5. Recipients can add it to their LinkedIn profile in two clicks

### Standards

- **Open Badges 3.0** — the IMS Global standard for digital credentials
- **W3C Verifiable Credentials** — cryptographically signed and tamper-evident
- **Ed25519 / JWS** signatures, with a per-issuer key encrypted at rest

## Quick start

Requires Docker and Docker Compose.

```bash
git clone https://github.com/WPBrigade/wpb-bootcamps.git
cd wpb-bootcamps
```

Create `src/backend/.env` from the template and fill in the real values:

```bash
cp src/backend/.env.example src/backend/.env
cp src/frontend/.env.example src/frontend/.env
```

At minimum set `APP_KEYS`, `JWT_SECRET`, `ADMIN_JWT_SECRET`, `API_TOKEN_SALT`,
`ENCRYPTION_KEY` and the `SMTP_*` block. See [Configuration](#configuration).

> **`ENCRYPTION_KEY` deserves special care.** It decrypts every issuer's signing
> key. Back it up somewhere safe and never change it — rotating it makes existing
> signing keys unreadable and you lose the ability to issue under that identity.

Then:

```bash
docker compose up -d --build
```

- Admin panel — http://localhost:1337/admin
- Application — http://localhost:3000
- Mailhog, a fake inbox for development — http://localhost:8025

**On first run, create your admin account** at `/admin`. Strapi shows a
registration form when no administrator exists yet.

### Making yourself an issuer

Being an issuer is a property of your **Profile**, not a Strapi role. There is
no sign-up page, so both rows are made in the Strapi admin:

1. Content Manager → **User** → create one with your email, a password and the
   `authenticated` role. This is the frontend login, and it is separate from the
   Strapi admin account you are using to create it
2. Content Manager → **Profile** → find the profile with the same email, or
   create one
3. Set **profileType** to `Issuer` or `Both` → Save → Publish

The email has to match on both rows — that is what links a login to its
profile. Without a profile carrying that type, `/issue` redirects to the
dashboard; without a profile at all, the dashboard itself comes back empty.

## Issuing certificates

### One at a time

Go to **Issue Badges**, pick a template, enter a name and email, submit.

### A whole cohort, by CSV

Upload a file with a header row. Column order and letter case don't matter, and
quoted fields, semicolon separators and files saved from Excel all work.

```csv
name,email,expirationDate
Jane Doe,jane@example.com,2027-12-31
Ali Khan,ali@example.com,
```

| Column | Required | Notes |
|---|---|---|
| `name` | yes | Printed on the certificate |
| `email` | yes | Where the certificate is sent |
| `expirationDate` | no | `YYYY-MM-DD` only — ambiguous formats like `31/12/2027` are rejected rather than guessed |
| `organization` | no | Accepted by the parser but not currently stored |

Rows with problems are reported by line number before anything is issued, and
skipped — the rest still go out. After issuing, the results table shows each
recipient twice over: whether the **certificate** was created, and whether the
**email** reached them. Those can differ, and it matters which failed.

## The certificate design

Certificates are generated on request — nothing is stored — so a design change
applies to every certificate ever issued, without reissuing anything.

The SVG is the original; PDF and PNG are rendered from it server-side, so all
three always show the same design. Recipients get all three from the download
button on their certificate page.

The design lives in **`src/backend/src/utils/certificate-template.ts`** on a
792 × 612 canvas (US Letter, landscape). Supporting artwork sits in
`src/utils/certificate-assets/`: the WPBrigade logo, the blackletter heading as
outlines, and the script face used for recipients' names.

The heading and the recipient's name are drawn as **vector outlines** rather
than set in a font. A certificate gets shown in an `<img>` tag, converted to
PNG, and opened offline after downloading — a missing font in any of those
places would silently fall back to a plain serif.

Everything else on the panel is set in **Georgia**, with metrically identical
Gelasio behind it for machines that lack it. One face, deliberately: the
printed reference set the programme in Georgia and the date directly beneath it
in Roboto, and adjacent lines of the same rank in two families is what made the
certificate read as assembled rather than designed. A sans survives only inside
artwork that carries its own typography — the logo lockup and the seal's
legends.

### What each Achievement contributes

Set these in Strapi admin → Content Manager → Achievement:

| Field | Where it appears |
|---|---|
| `name` | The programme, in quotes |
| `description` | The citation paragraph |
| `signatureImage` | Above the signature rule |
| `signatoryName` | Under the rule (falls back to the issuer's name) |
| `signatoryTitle` | Under that — "Manager", "Director" |
| `programmeStartDate` / `programmeEndDate` | "From: July 2026 – August 2026" |
| `image` | Badge artwork, used in listings and emails |

With no programme dates set, the certificate prints the issue date instead.

## Configuration

All backend variables live in `src/backend/.env`; the full list with comments is
in `.env.example`.

### Required

| Variable | Purpose |
|---|---|
| `APP_KEYS`, `JWT_SECRET`, `ADMIN_JWT_SECRET`, `API_TOKEN_SALT`, `TRANSFER_TOKEN_SALT` | Strapi secrets — generate fresh ones per environment |
| `ENCRYPTION_KEY` | Encrypts issuer signing keys at rest. **Back up, never rotate.** |
| `DATABASE_*` | Postgres connection |
| `SMTP_*` | Outbound email |

### Branding

Outbound emails and the certificate follow these:

```bash
BRAND_NAME=WPBrigade
BRAND_PRIMARY_COLOR=#3458eb
BRAND_CONTACT_EMAIL=bootcamp@wpbrigade.com
SMTP_FROM_NAME=WPBrigade
LINKEDIN_ORGANIZATION_ID=          # numeric company page id; blank matches by name
```

The frontend mirrors them with `NUXT_PUBLIC_BRAND_*` in `src/frontend/.env`.

### Optional

- `SLACK_WEBHOOK_URL`, `TEAMS_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL` — post to a channel when a certificate is issued
- `EVENT_BUS_PROVIDER=redis` with `EVENT_BUS_REDIS_*` — webhook delivery through Redis instead of in-memory
- `UPLOAD_PROVIDER=s3` with `S3_*` — store uploads in S3 rather than on disk, required if you run more than one backend instance
- `LOG_FORMAT_JSON=true` — structured logs for Loki/ELK
- `CORS_ALLOWED_ORIGINS` — extra origins beyond the defaults

## Backups

The database holds the signing keys and the proofs. Losing it doesn't just lose
records — it permanently breaks verification for every certificate already in
recipients' hands, and nothing reconstructs that.

Backups run automatically: every 24 hours, keeping the 7 most recent, into
`./backups/` on the host. Each one is a `pg_dump` of the database plus a copy of
the uploaded media.

```bash
BACKUP_SCHEDULE_ENABLED=true
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_COUNT=7
```

On demand, and restoring:

```bash
docker exec certo_backend node scripts/backup.js
docker exec certo_backend npm run restore -- --from backups/<timestamp> --yes
```

Two things this does **not** do for you: copies live on the same machine as the
database, so send them somewhere else periodically; and a backup nobody has
restored is a hope, not a backup — test one into a scratch database.

## Project structure

```
src/
├── backend/                    Strapi 5 (TypeScript)
│   ├── src/
│   │   ├── api/
│   │   │   ├── achievement/        Certificate templates
│   │   │   ├── credential/         Issued certificates, verification, certificate rendering
│   │   │   ├── profile/            Issuers and recipients, signing keys, multi-tenancy
│   │   │   ├── revocation-list/    StatusList2021 slots
│   │   │   ├── evidence/ endorsement/ webhook-subscription/ scheduled-issuance/
│   │   ├── bootstrap/          Permissions, seeding, email templates, scheduled backups
│   │   ├── utils/
│   │   │   ├── certificate-template.ts     The certificate design
│   │   │   └── certificate-assets/         Logo, heading outlines, script font
│   │   └── middlewares/        Rate limiting, request ids, API versioning
│   └── scripts/                backup, restore, repair-issuer-links,
│                               find-profileless-accounts, smoke-flow
│
└── frontend/                   Nuxt 3 (Vue 3, Pinia, Una UI)
    ├── pages/                  issue, verify, dashboard, credentials/[id]
    ├── composables/            useRecipientsCsv, useLinkedInShare, useBranding
    └── e2e/                    Playwright

sdk/    TypeScript client        cli/    Ink terminal client
mcp/    MCP server for AI tools  helm/   Kubernetes chart
docs/   Architecture and operations notes
```

## Local development without Docker

Node 18–22 and a Postgres instance (or SQLite for quick work).

```bash
cd src/backend  && npm install && npm run develop   # http://localhost:1337
cd src/frontend && npm install && npm run dev       # http://localhost:3000
```

Start the backend first — the frontend expects the API.

## API

Full OpenAPI documentation at http://localhost:1337/documentation.

### Public

| Endpoint | Purpose |
|---|---|
| `GET /api/credentials/:id` | Certificate as Open Badges 3.0 JSON |
| `GET /api/credentials/:id/verify` | Verify signature, expiry and revocation |
| `GET /api/credentials/:id/certificate` | The certificate. `?format=pdf` or `?format=png`; SVG by default |
| `GET /api/achievements` | Published templates |
| `GET /api/status-lists/:id` | The issuer's revocation status list, as a signed StatusList2021Credential |

`:id` accepts the `urn:uuid:` credential id, Strapi's documentId, or the numeric
row id.

### Authenticated

| Endpoint | Purpose |
|---|---|
| `POST /api/credentials/issue` | Issue one certificate |
| `POST /api/credentials/batch-issue` | Issue to a list of recipients |
| `POST /api/credentials/:id/revoke` | Revoke |
| `POST /api/achievements` | Create a template |
| `GET /api/profiles/me` | The signed-in user's profile |

Issuing checks that you own the achievement you're issuing from.

## Testing

```bash
cd src/backend  && npm test            # Jest — 259 tests
cd src/frontend && npm run test:unit   # Vitest
cd src/frontend && npm run test:e2e    # Playwright
```

And the one that issues a certificate, against a running development instance:

```bash
node src/backend/scripts/smoke-flow.js
```

It logs in as the seeded issuer, issues a credential, verifies it, fetches the
issuer's status list the way a third party would and checks the slot, confirms
the PDF's text layer, revokes, verifies that the revocation took in both the
credential and the published bitstring, and deletes what it made. No
dependencies — plain `node` against any instance, and it runs in CI. The suites
above cover the pieces; everything between them is only exercised here.

## Going to production

- [ ] DNS for both hosts resolving to the Docker host **before** the first deploy — `bootcamp.labspk.com` and `bootcamp-api.labspk.com` in `docker-compose.dokploy.yml`. Traefik asks Let's Encrypt for a certificate on startup, and that fails until the name resolves
- [ ] `NUXT_PUBLIC_WEBSITE_URL` and `NUXT_PUBLIC_API_URL` set to those same hosts. The first is what canonical links, the sitemap, OG tags and certificate QR codes are built from; the second is the address the *browser* uses to reach the API
- [ ] `NODE_ENV=production` — the compose file defaults to it. Keeps internal errors out of API responses and stops the development seeder creating a default admin account
- [ ] Fresh `APP_KEYS`, `JWT_SECRET`, `ADMIN_JWT_SECRET`, `API_TOKEN_SALT` — never reuse development values
- [ ] `ENCRYPTION_KEY` backed up somewhere durable, and unchanged
- [ ] `CORS_ALLOWED_ORIGINS` pointing at your real domains
- [ ] HTTPS terminated, with `PUBLIC_URL` and `FRONTEND_URL` on `https://` — certificate URLs are embedded in signed payloads and in emails already sent, so changing them later invalidates links in the wild
- [ ] Mailhog removed from the compose file — it's a development fake inbox
- [ ] Backups running, and one restore tested
- [ ] Admin password changed from anything used in development
- [ ] `BRAND_CONTACT_EMAIL` on an inbox somebody reads — it is printed in every issuance email, and the same address appears in the footer and both legal pages as where privacy and erasure requests go
- [ ] No `.env` in either image. Both directories carry a `.dockerignore` that excludes it; secrets reach a container through its environment, never a file in the build context. `docker run --rm --entrypoint sh <image> -c 'ls -a'` is enough to check

### Changing the domain

The site currently runs on `bootcamp.labspk.com`, with the API on
`bootcamp-api.labspk.com`, and is expected to move to `wpbrigade.com`
subdomains later. Both hosts are named in five places, and a move needs all of
them — the failure mode when one is missed is silent, because each piece is
internally consistent and only disagrees with the outside world.

1. **DNS**, before anything else. Create the records and leave them
   **DNS-only** (grey cloud) in Cloudflare for the first deploy: Traefik's
   ACME challenge needs to reach the origin, and a proxied record on a zone set
   to Full (strict) has no valid origin certificate yet — which is the thing
   being requested. Turn the proxy on once the certificate is issued.
2. **`docker-compose.dokploy.yml`** — the four Traefik `Host()` rules. Traefik
   routes on the hostname, so until these match, the new name reaches the
   origin and gets Traefik's own `404 page not found`.
3. **Environment** — `NUXT_PUBLIC_WEBSITE_URL`, `NUXT_PUBLIC_API_URL`,
   `PUBLIC_URL`, `FRONTEND_URL`. Note that `PUBLIC_URL` is embedded in signed
   payloads and in emails already sent, so certificates issued under the old
   domain keep pointing at it.
4. **`src/frontend/public/robots.txt`** and **`llms.txt`** — static files, so
   they cannot read the environment. The `Sitemap:` line and the API URLs are
   written out in full.
5. **`config/middlewares.ts`** — already lists both domains, so no change is
   needed. Removing the old pair is worth doing once the move has settled.

Canonical links, the sitemap, OG tags and certificate QR codes all derive from
`NUXT_PUBLIC_WEBSITE_URL` (via `SITE_URL` in `nuxt.config.ts`), so they follow
step 3 on their own. The sitemap's own origin comes from `site.url`, which is
baked at build time — set `NUXT_SITE_URL` too, or rebuild.

## Known limitations

Worth knowing before promising any of it to a customer:

- **There is no sign-up.** An account exists because a certificate was issued to
  that email address — issuance creates the account and the profile together.
  Anyone else, including staff, needs one made in the admin panel. Recipients
  never receive a password, so their way in is "Forgot password?" on `/login`.
- **Local passwords only** — no OAuth or single sign-on.
- **Certificates are not in search results, by design.** Each certificate page
  is publicly reachable — a link or a QR scan resolves for anyone, with no
  login — but it sends `noindex` and is kept out of the sitemap, because the
  page names its recipient and nobody accepting a certificate agreed to be
  findable by name. A recipient expecting to Google themselves and find it
  will not. Change it in `pages/credentials/[id]/index.vue` and the sitemap's
  `exclude` list in `nuxt.config.ts` if that trade is ever made differently.
- **The Terms carry no governing-law clause.** The inherited one named Italy
  and the courts of Florence, which was never right for WPBrigade, so it was
  removed rather than replaced with a guess. Add the real jurisdiction to
  `src/frontend/composables/useTermsContent.ts` once counsel settles it.
- Backend test coverage is focused on signing, verification and issuance. The
  Playwright suite runs in CI but only checks that pages render.
- **The certificate artwork is rasterised.** It prints at roughly 288 DPI,
  which is past what the eye picks up on paper, but it is an image rather than
  vector art, so it does not scale indefinitely. The PDF carries an invisible
  text layer over that image — the way a scanned document is made searchable —
  so its text can be selected, copied, found with Ctrl-F and read aloud. The
  PNG cannot: it is a bitmap, and there is nowhere to put text in one. A name
  in a script a standard PDF font cannot encode is dropped from the PDF's
  search layer, though it still appears correctly on the certificate itself.

## Built on Certo

This project is a fork of [Certo](https://github.com/Schroedinger-Hat/certo) by
[Schrödinger Hat](https://www.schrodinger-hat.it/), whose maintainers built the
Open Badges implementation, verification pipeline and Strapi/Nuxt foundation
this runs on. WPBrigade's work sits on top: branding, the certificate design,
and fixes to issuance, authorization, CSV handling, email and backups.

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE).

The AGPL matters here in a practical way: if you run this as a service other
people use, they are entitled to the source of your modified version. Keeping
this repository available, or publishing your changes, is what satisfies that.
