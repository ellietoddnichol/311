import { createHash } from 'crypto';
import { getEstimatorDb } from '../db/connection.ts';

export function intakeLineMemoryKeyFromFields(input: {
  itemCode?: string;
  itemName?: string;
  description?: string;
}): string {
  const raw = [input.itemCode, input.itemName, input.description]
    .map((x) => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join('\t');
  return createHash('sha256').update(raw || 'empty').digest('hex').slice(0, 48);
}

export function getIntakeCatalogMemoryCatalogId(memoryKey: string): string | null {
  const row = getEstimatorDb()
    .prepare('SELECT catalog_item_id FROM intake_catalog_memory_v1 WHERE memory_key = ?')
    .get(memoryKey) as { catalog_item_id: string } | undefined;
  return row?.catalog_item_id ?? null;
}

export function upsertIntakeCatalogMemory(memoryKey: string, catalogItemId: string): void {
  const now = new Date().toISOString();
  getEstimatorDb()
    .prepare(
      `
    INSERT INTO intake_catalog_memory_v1 (memory_key, catalog_item_id, hit_count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(memory_key) DO UPDATE SET
      catalog_item_id = excluded.catalog_item_id,
      hit_count = hit_count + 1,
      updated_at = excluded.updated_at
  `
    )
    .run(memoryKey, catalogItemId, now);
}

/**
 * Persist an estimator-confirmed description/SKU → catalog mapping for future intake matching.
 * Used by takeoff line create/update (workspace, finalize-parser) so all acceptance paths train memory.
 */
export function recordIntakeCatalogMemoryFromAcceptedMatch(fields: {
  sku: string | null | undefined;
  description: string | null | undefined;
  catalogItemId: string | null | undefined;
}): void {
  const catalogItemId = String(fields.catalogItemId ?? '').trim();
  if (!catalogItemId) return;
  const description = String(fields.description ?? '').trim();
  const sku = String(fields.sku ?? '').trim();
  if (!description && !sku) return;
  const memoryKey = intakeLineMemoryKeyFromFields({
    itemCode: sku || undefined,
    description,
  });
  upsertIntakeCatalogMemory(memoryKey, catalogItemId);
}
