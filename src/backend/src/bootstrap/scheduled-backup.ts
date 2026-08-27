/**
 * Runs scripts/backup.js on a schedule.
 *
 * The script has existed and worked for a while; nothing ever called it. A
 * credentialing platform is an unusually bad place to have no backups: the
 * signing keys and proofs live in the database, so losing it doesn't just
 * lose records, it permanently breaks verification for every certificate
 * already in recipients' hands. There is no reconstructing that from the
 * certificate images people downloaded.
 *
 * Spawned as a child process rather than imported: backup.js is plain
 * CommonJS outside the compiled output, it shells out to pg_dump, and a
 * failure there should not be able to take down the app that scheduled it.
 *
 * Environment:
 *   BACKUP_SCHEDULE_ENABLED   'false' to turn this off (default: on)
 *   BACKUP_INTERVAL_HOURS     hours between runs (default: 24)
 *   BACKUP_RETENTION_COUNT    how many to keep - read by backup.js itself
 *
 * See docs/self-hosting.md. Backups land in backups/, which docker-compose
 * bind-mounts to a host directory - without that they would sit in the
 * container's writable layer and vanish on the next rebuild.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

/** Long enough after boot that startup work has settled. */
const STARTUP_DELAY_MS = 60_000;

function runBackupOnce(strapi: any): void {
  const script = path.join(process.cwd(), 'scripts', 'backup.js');
  const child = spawn(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { output += chunk.toString(); });

  child.on('error', (error) => {
    strapi.log.error(`[backup] Could not start the backup script: ${error.message}`);
  });

  child.on('close', (code) => {
    if (code === 0) {
      // The script's own last line names the directory it wrote.
      const written = output.split('\n').find(line => line.includes('Database:'))?.trim();
      strapi.log.info(`[backup] Completed. ${written ?? ''}`.trim());
      return;
    }

    // Loud, because a silent backup failure is indistinguishable from a
    // working backup right up until the moment someone needs to restore.
    strapi.log.error(`[backup] FAILED (exit ${code}). Backups are not being taken.`);
    strapi.log.error(`[backup] Output: ${output.trim().split('\n').slice(-5).join(' | ')}`);
  });
}

export function scheduleBackups(strapi: any): void {
  if (process.env.BACKUP_SCHEDULE_ENABLED === 'false') {
    strapi.log.info('[backup] Scheduled backups are disabled (BACKUP_SCHEDULE_ENABLED=false).');
    return;
  }

  const hours = Number.parseFloat(process.env.BACKUP_INTERVAL_HOURS ?? '24');
  const intervalHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
  const intervalMs = intervalHours * 60 * 60 * 1000;

  setTimeout(() => runBackupOnce(strapi), STARTUP_DELAY_MS);
  setInterval(() => runBackupOnce(strapi), intervalMs);

  strapi.log.info(`[backup] Scheduled every ${intervalHours}h, keeping the ${process.env.BACKUP_RETENTION_COUNT ?? '7'} most recent.`);
}
