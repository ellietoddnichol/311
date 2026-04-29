import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProposalLineItems } from './proposalDocument.ts';
import type { TakeoffLineRecord } from '../types/estimator.ts';

function line(partial: Partial<TakeoffLineRecord> & { id: string; description: string }): TakeoffLineRecord {
  return {
    id: partial.id,
    projectId: partial.projectId || 'p1',
    roomId: partial.roomId || 'r1',
    sourceType: partial.sourceType || 'manual',
    sourceRef: null,
    description: partial.description,
    proposalVisibility: partial.proposalVisibility,
    proposalDescriptionOverride: partial.proposalDescriptionOverride ?? null,
    parentEstimateLineId: partial.parentEstimateLineId ?? null,
    sourceLineType: partial.sourceLineType,
    sku: partial.sku ?? null,
    category: partial.category ?? 'Toilet Accessories',
    subcategory: null,
    baseType: null,
    qty: partial.qty ?? 1,
    unit: partial.unit ?? 'EA',
    materialCost: 10,
    baseMaterialCost: 10,
    laborMinutes: 10,
    laborCost: 5,
    baseLaborCost: 5,
    pricingSource: 'auto',
    unitSell: 15,
    lineTotal: 15,
    notes: null,
    bundleId: null,
    catalogItemId: null,
    variantId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test('suggested/internal add-ins stay internal_only and do not print', () => {
  const items = buildProposalLineItems([
    line({ id: 'a', description: 'Field measure / field_verify', sourceLineType: 'add_in', proposalVisibility: 'internal_only' }),
    line({ id: 'b', description: 'Grab Bar 36"', sourceLineType: 'catalog_item' }),
  ]);
  assert.equal(items.some((i) => i.description.toLowerCase().includes('field')), false);
  assert.equal(items.some((i) => i.description.toLowerCase().includes('grab bar')), true);
});

test('accepted demo/remove can print when marked customer_visible', () => {
  const items = buildProposalLineItems([
    line({ id: 'a', description: 'Demo/remove existing accessories', sourceLineType: 'add_in', proposalVisibility: 'customer_visible' }),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.description.toLowerCase().includes('demo'), true);
});

test('quote_subtotal never prints', () => {
  const items = buildProposalLineItems([
    line({ id: 'q', description: 'MATERIAL: $6695', sourceType: 'quote_subtotal', sourceLineType: 'quote_subtotal' }),
    line({ id: 'b', description: 'Grab Bar 36"' }),
  ]);
  assert.equal(items.some((i) => i.description.toLowerCase().includes('6695')), false);
  assert.equal(items.some((i) => i.description.toLowerCase().includes('grab bar')), true);
});

test('expanded grab bar set does not double print parent and children (children_only default)', () => {
  const items = buildProposalLineItems([
    line({ id: 'p', description: '6 sets 6806 grab bars – 18, 36, 42', sourceLineType: 'expanded_parent' }),
    line({ id: 'c1', description: 'Grab Bar 18"', parentEstimateLineId: 'p', sourceLineType: 'expanded_child' }),
    line({ id: 'c2', description: 'Grab Bar 36"', parentEstimateLineId: 'p', sourceLineType: 'expanded_child' }),
    line({ id: 'c3', description: 'Grab Bar 42"', parentEstimateLineId: 'p', sourceLineType: 'expanded_child' }),
  ]);
  assert.equal(items.some((i) => i.description.toLowerCase().includes('sets 6806')), false);
  assert.equal(items.filter((i) => i.description.toLowerCase().includes('grab bar')).length, 3);
});

test('proposal descriptions are cleaned of estimator jargon', () => {
  const items = buildProposalLineItems([
    line({ id: 'a', description: 'blocking_check and rough_opening_check required' }),
  ]);
  assert.equal(items.length, 1);
  assert.equal(/blocking_check|rough_opening_check/i.test(items[0]!.description), false);
  assert.equal(items[0]!.description.length > 0, true);
});

