# syntax=docker/dockerfile:1
#
# Three stages, because the image that runs Strapi needs far less than the one
# that builds it. The previous single-stage build produced 3.63GB:
#
#   1.54GB  npm ci                 the whole dependency tree, devDependencies included
#   1.09GB  COPY . .               the host's node_modules, on top of the ones just installed
#     26MB  npm run build          the admin panel
#
# The base image was never the problem - this was already Alpine. The problem
# was carrying two copies of node_modules and never dropping the build tools.
#
# What is left in the runtime stage is the production dependency tree, the
# compiled output, and nothing else. Strapi 5 declares its own build toolchain
# (@swc, typescript, node-plop) and the admin panel's media libraries (hls.js,
# @mux) as *runtime* dependencies, so `--omit=dev` still installs about a
# gigabyte of them; that is Strapi's floor, not this file's.

# ---------------------------------------------------------------------------
# Builder: the full tree, because building the admin panel needs the dev
# dependencies. Everything here is discarded except dist/.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# better-sqlite3 has no musl prebuild and compiles from source. Only this
# stage and the next need a compiler; the runtime stage never sees one.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# NODE_ENV matters to the build itself: it decides whether the admin bundle is
# minified and whether React ships its development warnings.
ENV NODE_ENV=production
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime dependencies, resolved from the same lockfile as the builder's so
# the two cannot drift. A separate stage rather than `npm prune` in the
# builder: prune leaves the packages' own build artefacts and npm's cache
# behind, and this way the compiler never touches the final image.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# ---------------------------------------------------------------------------
# Runtime.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# postgresql16-client (matching the postgres:16 image in docker-compose.yml)
# provides pg_dump/pg_restore for scripts/backup.js and scripts/restore.js -
# see docs/self-hosting.md.
#
# bash is here for people, not for the app: the base image ships busybox ash,
# so `docker compose exec backend bash` fails and anyone debugging a
# deployment has to know to type `sh` instead. Costs about a megabyte.
RUN apk add --no-cache postgresql16-client bash

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# package.json alone, not the whole tree: `npm run start` reads its scripts,
# and Strapi reads the version. The lockfile is not needed to run.
COPY package.json ./
# tsconfig.json is how Strapi resolves where the compiled output lives, so a
# TypeScript project needs it present even though nothing is compiled here.
#
# And the sources it points at have to come with it. `strapi start` calls
# tsUtils.resolveOutDir, which parses this file, and TypeScript reports
# "TS18003: No inputs were found in config file" when its `include` globs match
# nothing - a diagnostic Strapi treats as fatal, so the container exits before
# it listens. Nothing recompiles them: start resolves paths and then runs what
# is already in dist. Together they are under 2MB.
COPY tsconfig.json ./
COPY src ./src
COPY config ./config
# Strapi serves these from the app root, not from dist. public/uploads is a
# volume in production, so what is copied here is only the directory and what
# ships with it.
COPY public ./public
# The favicon middleware (strapi::favicon in config/middlewares.ts) reads this
# by path from the app root.
COPY favicon.png ./
# Migrations run at startup and are plain .js, so `strapi build` does not
# compile them into dist and they have to be carried over as they are. Leaving
# them out is silent: the app boots and the migration simply never runs.
COPY database ./database
# Referenced by the backup, restore and certo npm scripts.
COPY scripts ./scripts

EXPOSE 1337

# Still root, deliberately. The production compose mounts named volumes over
# /app/public/uploads and /app/backups, and an existing volume keeps the
# ownership it was created with - switching to the `node` user now would leave
# a running deployment unable to write uploads or backups. Worth doing behind
# a one-off chown, not silently in a size change.
CMD ["npm", "run", "start"]
