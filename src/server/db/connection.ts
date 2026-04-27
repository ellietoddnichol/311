import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPgDriver } from './driver.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../../estimator.db');

export const estimatorDb = new Database(dbPath);
estimatorDb.pragma('journal_mode = WAL');
estimatorDb.pragma('foreign_keys = ON');

/** Used by `query.ts` for SQLite. Throws when `DB_DRIVER=pg`. */
export function getEstimatorDb(): Database {
  if (isPgDriver()) {
    throw new Error('getEstimatorDb() is not available when DB_DRIVER=pg. Use dbAll/dbGet/dbRun from src/server/db/query.ts.');
  }
  return estimatorDb;
}
