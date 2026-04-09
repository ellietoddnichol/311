import { api } from '../services/api';

const LAST_SYNC_MS_KEY = 'estimator_last_catalog_sync_ms';
/** Avoid hammering Sheets on every navigation; still runs on each fresh app load after this window. */
const MIN_INTERVAL_MS = 45_000;

export function touchCatalogSyncTimestamp(): void {
  try {
    localStorage.setItem(LAST_SYNC_MS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Throttled background sync (e.g. once when the shell mounts). */
export function maybeSyncCatalogInBackground(): void {
  if (typeof window === 'undefined') return;
  try {
    const last = Number(localStorage.getItem(LAST_SYNC_MS_KEY) || '0');
    if (Date.now() - last < MIN_INTERVAL_MS) return;
  } catch {
    /* continue */
  }

  void (async () => {
    try {
      await api.syncV1Catalog();
      touchCatalogSyncTimestamp();
    } catch (err) {
      console.warn('[catalog] Background sync failed.', err);
    }
  })();
}

/** Fire a sync without waiting (e.g. before starting New Project). */
export function fireCatalogSyncForNewWork(): void {
  void (async () => {
    try {
      await api.syncV1Catalog();
      touchCatalogSyncTimestamp();
    } catch (err) {
      console.warn('[catalog] Sync before new project failed.', err);
    }
  })();
}
