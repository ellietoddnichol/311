import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVendorSubtotalVarianceReport } from './vendorVarianceService.ts';
import type { TakeoffLineRecord } from '../../shared/types/estimator.ts';

function makeLine(partial: Partial<TakeoffLineRecord> & { id: string; description: string }): TakeoffLineRecord {
  const now = new Date().toISOString();
  return {
    id: partial.id,
    projectId: partial.projectId || 'p1',
    roomId: partial.roomId || 'r1',
    sourceType: partial.sourceType || 'manual',
    sourceRef: null,
    description: partial.description,
    sku: partial.sku ?? null,
    category: partial.category ?? 'Toilet Accessories',
    subcategory: null,
    baseType: null,
    qty: partial.qty ?? 1,
    unit: partial.unit ?? 'EA',
    materialCost: partial.materialCost ?? 0,
    baseMaterialCost: partial.baseMaterialCost ?? partial.materialCost ?? 0,
    laborMinutes: partial.laborMinutes ?? 0,
    laborCost: partial.laborCost ?? 0,
    baseLaborCost: partial.baseLaborCost ?? 0,
    pricingSource: partial.pricingSource ?? 'auto',
    unitSell: partial.unitSell ?? 0,
    lineTotal: partial.lineTotal ?? 0,
    notes: partial.notes ?? null,
    bundleId: null,
    catalogItemId: partial.catalogItemId ?? null,
    variantId: null,
    createdAt: now,
    updatedAt: now,
    proposalVisibility: (partial as any).proposalVisibility,
    proposalDescriptionOverride: (partial as any).proposalDescriptionOverride ?? null,
    parentEstimateLineId: (partial as any).parentEstimateLineId ?? null,
    sourceLineType: (partial as any).sourceLineType,
  } as TakeoffLineRecord;
}

test('quote_subtotal compares correctly against grouped material lines', () => {
  const notes = 'Vendor block: Bobrick / Toilet Accessories';
  const report = computeVendorSubtotalVarianceReport([
    makeLine({ id: 'qs', description: 'MATERIAL: $1000', sourceType: 'quote_subtotal', sourceLineType: 'quote_subtotal', notes }),
    makeLine({ id: 'm1', description: 'Grab Bar 36"', materialCost: 100, qty: 5, lineTotal: 500, catalogItemId: 'c1', notes }),
    makeLine({ id: 'm2', description: 'Soap Dispenser', materialCost: 50, qty: 10, lineTotal: 500, catalogItemId: 'c2', notes }),
  ]);

  assert.equal(report.blocks.length, 1);
  const block = report.blocks[0]!;
  assert.equal(block.vendorQuotedMaterialSubtotal, 1000);
  assert.equal(block.normalizedEstimatedMaterialSubtotal, 1000);
  assert.equal(block.varianceAmount, 0);
  assert.equal(block.matchedLineCount, 2);
});

test('internal-only add-ins do not affect subtotal comparison', () => {
  const notes = 'Vendor block: Scranton / Toilet Partitions';
  const report = computeVendorSubtotalVarianceReport([
    makeLine({ id: 'qs', description: 'Material: $500', sourceType: 'quote_subtotal', sourceLineType: 'quote_subtotal', notes }),
    makeLine({ id: 'wall', description: 'Partitions material', materialCost: 500, qty: 1, catalogItemId: 'c1', notes }),
    makeLine({ id: 'addin', description: 'Field measure', materialCost: 999, qty: 1, notes, sourceLineType: 'add_in', proposalVisibility: 'internal_only' as any }),
  ]);
  assert.equal(report.blocks[0]!.normalizedEstimatedMaterialSubtotal, 500);
});

test('expanded set children roll into the correct vendor subtotal block', () => {
  const notes = 'Vendor block: Bobrick / Toilet Accessories';
  const report = computeVendorSubtotalVarianceReport([
    makeLine({ id: 'qs', description: 'Material: $600', sourceType: 'quote_subtotal', sourceLineType: 'quote_subtotal', notes }),
    makeLine({ id: 'p', description: '6 sets 6806 grab bars – 18, 36, 42', materialCost: 0, qty: 1, notes, sourceLineType: 'expanded_parent' }),
    makeLine({ id: 'c1', description: 'Grab Bar 18"', materialCost: 100, qty: 2, notes, sourceLineType: 'expanded_child', parentEstimateLineId: 'p', catalogItemId: 'c1' }),
    makeLine({ id: 'c2', description: 'Grab Bar 36"', materialCost: 100, qty: 2, notes, sourceLineType: 'expanded_child', parentEstimateLineId: 'p', catalogItemId: 'c2' }),
    makeLine({ id: 'c3', description: 'Grab Bar 42"', materialCost: 100, qty: 2, notes, sourceLineType: 'expanded_child', parentEstimateLineId: 'p', catalogItemId: 'c3' }),
  ]);
  assert.equal(report.blocks[0]!.normalizedEstimatedMaterialSubtotal, 600);
  assert.equal(report.blocks[0]!.expandedLineCount >= 3, true);
});

test('unmatched lines reduce confidence and are surfaced', () => {
  const notes = 'Vendor block: Activar / Fire Extinguishers';
  const report = computeVendorSubtotalVarianceReport([
    makeLine({ id: 'qs', description: 'Material: $100', sourceType: 'quote_subtotal', sourceLineType: 'quote_subtotal', notes }),
    makeLine({ id: 'u1', description: 'Cabinet package', materialCost: 50, qty: 1, notes }),
  ]);
  const block = report.blocks[0]!;
  assert.equal(block.unmatchedLineCount, 1);
  assert.equal(block.confidence < 0.9, true);
  assert.equal(block.details.some((d) => d.lineId === 'u1'), true);
});

test('generic fallback rows are surfaced in the variance detail', () => {
  const notes = 'Vendor block: Salsbury / Mailbox';
  const report = computeVendorSubtotalVarianceReport([
    makeLine({ id: 'qs', description: 'Material: $200', sourceType: 'quote_subtotal', sourceLineType: 'quote_subtotal', notes }),
    makeLine({ id: 'g1', description: 'Mailbox cluster', materialCost: 200, qty: 1, sku: null, catalogItemId: null, notes }),
  ]);
  const block = report.blocks[0]!;
  assert.equal(block.genericFallbackLineCount, 1);
  assert.equal(block.details.some((d) => d.genericFallback), true);
});

test('high variance creates warning flags', () => {
  const notes = 'Vendor block: Liberty / Flagpole';
  const report = computeVendorSubtotalVarianceReport([
    makeLine({ id: 'qs', description: 'Material: $100', sourceType: 'quote_subtotal', sourceLineType: 'quote_subtotal', notes }),
    makeLine({ id: 'm1', description: 'Flagpole', materialCost: 200, qty: 1, catalogItemId: 'c1', notes }),
  ]);
  const block = report.blocks[0]!;
  assert.equal(block.variancePercent >= 0.25, true);
  assert.equal(block.flags.includes('high_variance_over'), true);
});

