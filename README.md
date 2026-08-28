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
4. **Anyone** can verify a certificate at `/verify` or by scanning its QR code
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

Being an issuer is a property of your **Profile**, not a Strapi role. After
registering in the app:

1. Strapi admin → Content Manager → **Profile**
2. Find the profile with your email, or create one
3. Set **profileType** to `Issuer` or `Both` → Save → Publish

Without a profile carrying that type, `/issue` redirects to the dashboard.

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

Certificates are generated as SVG on request — nothing is stored — so a design
change applies to every certificate ever issued, without reissuing anything.

The design lives in **`src/backend/src/utils/certificate-template.ts`** on a
792 × 612 canvas (US Letter, landscape). Supporting artwork sits in
`src/utils/certificate-assets/`: the WPBrigade logo, the blackletter heading as
outlines, and the script face used for recipients' names.

The heading and the recipient's name are drawn as **vector outlines** rather
than set in a font. A certificate gets shown in an `<img>` tag, converted to
PNG, and opened offline after downloading — a missing font in any of those
places would silently fall back to a plain serif.

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
BRAND_CONTACT_EMAIL=info@autops.online
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
│   └── scripts/                backup, restore, repair-issuer-links
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
| `GET /api/credentials/:id/certificate` | The certificate as SVG |
| `GET /api/achievements` | Published templates |

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
cd src/backend  && npm test            # Jest — 162 tests
cd src/frontend && npm run test:unit   # Vitest
cd src/frontend && npm run test:e2e    # Playwright
```

## Going to production

- [ ] `NODE_ENV=production` — the compose file defaults to it. Keeps internal errors out of API responses and stops the development seeder creating a default admin account
- [ ] Fresh `APP_KEYS`, `JWT_SECRET`, `ADMIN_JWT_SECRET`, `API_TOKEN_SALT` — never reuse development values
- [ ] `ENCRYPTION_KEY` backed up somewhere durable, and unchanged
- [ ] `CORS_ALLOWED_ORIGINS` pointing at your real domains
- [ ] HTTPS terminated, with `PUBLIC_URL` and `FRONTEND_URL` on `https://` — certificate URLs are embedded in signed payloads and in emails already sent, so changing them later invalidates links in the wild
- [ ] Mailhog removed from the compose file — it's a development fake inbox
- [ ] Backups running, and one restore tested
- [ ] Admin password changed from anything used in development

## Known limitations

Worth knowing before promising any of it to a customer:

- **Self-registration leaves an account without a profile.** People invited by
  being issued a certificate are fine — their profile is created automatically.
  Someone who signs up unprompted needs a profile made for them in the admin panel.
- **Revocation isn't fully standards-compliant.** StatusList2021 is stored as a
  list of indices rather than the spec's compressed bitstring. Our own verify
  page handles it; a third-party verifier may not.
- **Local passwords only** — no OAuth or single sign-on.
- **Certificates download as SVG.** PNG and PDF aren't implemented yet.
- Backend test coverage is focused on signing, verification and issuance;
  Playwright doesn't run in CI.

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
