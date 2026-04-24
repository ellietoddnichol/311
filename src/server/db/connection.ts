import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { initLegacyDb } from '../legacyInit.ts';
import { initEstimatorSchema } from './schema.ts';
import { resolveEstimatorDbPath } from './resolveEstimatorDbPath.ts';
import {
  backupSqliteToGcsOnce,
  getDurableSqliteGcsConfig,
  restoreSqliteFromGcsIfConfigured,
  startSqliteGcsBackupLoop,
} from './durableSqliteGcs.ts';
import { getDbPersistenceStatus, updateDbPersistenceStatus } from '../repos/dbPersistenceRepo.ts';

let estimatorDb: Database | null = null;
let backupStopper: { stop: () => Promise<void> } | null = null;
let prepared = false;
let resolvedDbPath: string | null = null;

export function getEstimatorDb(): Database {
  if (!estimatorDb) {
    // Sync-safe fallback for tests/scripts; production should call prepareEstimatorDbForServer() first.
    const dbPath = resolveEstimatorDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    estimatorDb = new Database(dbPath);
    estimatorDb.pragma('journal_mode = WAL');
    estimatorDb.pragma('foreign_keys = ON');
    initLegacyDb(estimatorDb);
    initEstimatorSchema(estimatorDb);
  }
  return estimatorDb;
}

export async function prepareEstimatorDbForServer(): Promise<void> {
  if (prepared) return;
  prepared = true;

  const dbPath = resolveEstimatorDbPath();
  resolvedDbPath = dbPath;
  const gcsCfg = getDurableSqliteGcsConfig();
  const mode =
    dbPath.startsWith('/data/')
      ? (gcsCfg ? 'volume' : 'volume')
      : gcsCfg
        ? 'ephemeral_gcs'
        : 'ephemeral';
  updateDbPersistenceStatus({
    dbPath,
    mode,
    gcsBucket: gcsCfg?.bucket ?? null,
    gcsObject: gcsCfg?.object ?? null,
  });

  const restore = await restoreSqliteFromGcsIfConfigured(dbPath);
  if (restore.message) {
    console.log(`[db] ${restore.message}`);
  }
  if (gcsCfg) {
    updateDbPersistenceStatus({
      restoreAttemptedAt: restore.attempted ? new Date().toISOString() : null,
      restoreStatus: restore.attempted
        ? restore.restored
          ? 'restored'
          : /No GCS snapshot found/i.test(restore.message || '')
            ? 'no_snapshot'
            : 'failed'
        : fs.existsSync(dbPath)
          ? 'skipped_existing_db'
          : 'not_configured',
      restoreMessage: restore.message ?? null,
    });
  } else {
    updateDbPersistenceStatus({
      restoreAttemptedAt: null,
      restoreStatus: fs.existsSync(dbPath) ? 'skipped_existing_db' : 'not_configured',
      restoreMessage: restore.message ?? null,
    });
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  estimatorDb = new Database(dbPath);
  estimatorDb.pragma('journal_mode = WAL');
  estimatorDb.pragma('foreign_keys = ON');
  initLegacyDb(estimatorDb);
  initEstimatorSchema(estimatorDb);

  backupStopper = startSqliteGcsBackupLoop(estimatorDb, dbPath, {
    onBackupResult: (result) => {
      if (result.ok) {
        updateDbPersistenceStatus({
          lastBackupSuccessAt: result.attemptedAt,
          lastBackupError: null,
        });
      } else {
        updateDbPersistenceStatus({
          lastBackupFailureAt: result.attemptedAt,
          lastBackupError: result.message || 'Backup failed.',
        });
      }
    },
  });
}

export function getResolvedEstimatorDbPath(): string {
  return resolvedDbPath || resolveEstimatorDbPath();
}

export function getDbPersistenceStatusSnapshot() {
  return getDbPersistenceStatus();
}

export async function runDbBackupNow(): Promise<{ ok: boolean; message: string }> {
  const db = getEstimatorDb();
  const dbPath = getResolvedEstimatorDbPath();
  const result = await backupSqliteToGcsOnce(db, dbPath);
  const now = new Date().toISOString();
  if (result.ok) {
    updateDbPersistenceStatus({
      lastBackupSuccessAt: now,
      lastBackupError: null,
      // leave lastBackupFailureAt as-is for audit
    });
    return { ok: true, message: result.message || 'Backup complete.' };
  }
  updateDbPersistenceStatus({
    lastBackupFailureAt: now,
    lastBackupError: result.message || 'Backup failed.',
  });
  return { ok: false, message: result.message || 'Backup failed.' };
}
