#!/usr/bin/env node

/**
 * Full-instance restore from a directory produced by scripts/backup.js.
 * Destructive: postgres restore uses `pg_restore --clean --if-exists`,
 * which drops existing objects before recreating them; sqlite restore
 * overwrites the live DB file outright. Requires --yes for exactly that
 * reason - stop the app first (especially for sqlite, so nothing else has
 * the file open) and only pass --yes once you're sure.
 *
 * See docs/self-hosting.md.
 * Usage: npm run restore -- --from <backup-dir> --yes
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getConnectionConfig } = require('./backup');

const BACKEND_ROOT = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(BACKEND_ROOT, 'public', 'uploads');

function parseArgs(argv) {
  const args = { yes: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--yes') args.yes = true;
  }
  return args;
}

function restorePostgres(connection, dumpFile) {
  const args = ['--clean', '--if-exists'];
  const env = { ...process.env };

  if (connection.connectionString) {
    args.push('--dbname', connection.connectionString);
  } else {
    args.push(
      '--host', connection.host,
      '--port', String(connection.port),
      '--username', connection.user,
      '--dbname', connection.database
    );
    env.PGPASSWORD = connection.password;
  }
  args.push(dumpFile);

  const result = spawnSync('pg_restore', args, { stdio: 'inherit', env });
  if (result.error) {
    throw new Error(`Could not run pg_restore - is the postgresql-client installed? (${result.error.message})`);
  }
  if (result.status !== 0) {
    throw new Error(`pg_restore exited with code ${result.status}`);
  }
}

function restoreSqlite(connection, dataFile) {
  fs.copyFileSync(dataFile, connection.filename);
}

/**
 * Empties a directory without removing the directory itself.
 *
 * `public/uploads` is a Docker volume mount point in every containerised
 * install, and removing a mount point fails with EBUSY. This used to be
 * `fs.rmSync(UPLOADS_DIR, { recursive: true })`, so `npm run restore` inside
 * the container died with "EBUSY: resource busy or locked, rmdir
 * '/app/public/uploads'" - *after* the database had already been replaced. A
 * restore tool that half-succeeds and then reports failure is worse than one
 * that does not run at all, and it took actually restoring a backup to find:
 * the code reads correctly and works fine outside a container.
 */
function emptyDirectory(target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
    return;
  }

  for (const entry of fs.readdirSync(target)) {
    fs.rmSync(path.join(target, entry), { recursive: true, force: true });
  }
}

function restoreUploads(fromDir) {
  const src = path.join(fromDir, 'uploads');
  if (!fs.existsSync(src)) {
    console.log('[Restore] No uploads/ in backup, skipping media restore');
    return;
  }
  emptyDirectory(UPLOADS_DIR);
  fs.cpSync(src, UPLOADS_DIR, { recursive: true });
}

function runRestore() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.from) {
    console.error('[Restore] Usage: npm run restore -- --from <backup-dir> --yes');
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(args.from)) {
    console.error(`[Restore] Backup directory not found: ${args.from}`);
    process.exitCode = 1;
    return;
  }

  if (!args.yes) {
    console.error(
      '[Restore] Refusing to proceed without --yes: this REPLACES the current ' +
      'database (and public/uploads) with the contents of the backup. Stop the ' +
      'app first, confirm this is the right backup directory, then re-run with --yes.'
    );
    process.exitCode = 1;
    return;
  }

  let databaseRestored = false;

  try {
    const { client, ...connection } = getConnectionConfig();
    console.log(`[Restore] Restoring ${client} database from ${args.from}...`);

    if (client === 'postgres') {
      restorePostgres(connection, path.join(args.from, 'db.dump'));
    } else {
      restoreSqlite(connection, path.join(args.from, 'data.db'));
    }

    // Tracked so the failure message below can say what state the instance is
    // actually in. There is no transaction spanning the database and the
    // filesystem, so "it failed" on its own leaves an operator guessing during
    // the one hour they can least afford to.
    databaseRestored = true;

    restoreUploads(args.from);

    console.log('[Restore] Done.');
  } catch (error) {
    console.error('[Restore] Failed:', error);

    if (databaseRestored) {
      console.error(
        '[Restore] The DATABASE was already restored from this backup - only the ' +
        'uploads failed. Do not re-run the database restore; copy ' +
        `${path.join(args.from, 'uploads')} over public/uploads by hand, then start the app.`
      );
    } else {
      console.error('[Restore] Nothing was changed - the database is as it was.');
    }

    process.exitCode = 1;
  }
}

if (require.main === module) {
  runRestore();
}

module.exports = { runRestore };
