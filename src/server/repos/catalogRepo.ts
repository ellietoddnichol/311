import { dbAll } from '../db/query.ts';
import type { CatalogItem } from '../../types.ts';
import { ensureTakeoffCatalogSeeded } from '../services/intake/takeoffCatalogRegistry.ts';
import { getCatalogItemsTableName } from '../db/catalogTable.ts';

function mapCatalogRow(row: any): CatalogItem {
  return {
    id: row.id,
    sku: row.sku || '',
    category: row.category || '',
    subcategory: row.subcategory || undefined,
    family: row.family || undefined,
    description: row.description || '',
    manufacturer: row.manufacturer || undefined,
    model: row.model || undefined,
    uom: row.uom || 'EA',
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

export async function listActiveCatalogItems(): Promise<CatalogItem[]> {
  ensureTakeoffCatalogSeeded();
  const table = getCatalogItemsTableName();
  const rows = await dbAll(`SELECT * FROM ${table} WHERE active = 1 ORDER BY category, description`);
  return rows.map(mapCatalogRow);
}
