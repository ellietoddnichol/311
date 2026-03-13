import { estimatorDb } from '../db/connection.ts';
import { CatalogItem } from '../../types.ts';

function mapCatalogRow(row: any): CatalogItem {
  return {
    id: row.id,
    sku: row.sku,
    category: row.category,
    subcategory: row.subcategory || undefined,
    family: row.family || undefined,
    description: row.description,
    manufacturer: row.manufacturer || undefined,
    model: row.model || undefined,
    uom: row.uom,
    baseMaterialCost: Number(row.base_material_cost || 0),
    baseLaborMinutes: Number(row.base_labor_minutes || 0),
    laborUnitType: row.labor_unit_type || undefined,
    taxable: !!row.taxable,
    adaFlag: !!row.ada_flag,
    tags: row.tags ? JSON.parse(row.tags) : [],
    notes: row.notes || undefined,
    active: !!row.active,
  };
}

export function listActiveCatalogItems(): CatalogItem[] {
  const rows = estimatorDb.prepare('SELECT * FROM catalog_items WHERE active = 1 ORDER BY category, sku, description').all();
  return rows.map(mapCatalogRow);
}

export function getCatalogItemById(id: string): CatalogItem | null {
  const row = estimatorDb.prepare('SELECT * FROM catalog_items WHERE id = ? LIMIT 1').get(id);
  return row ? mapCatalogRow(row) : null;
}