import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { buildProjectConditionSummaryLines, createDefaultProjectJobConditions, normalizeProjectJobConditions } from '../../shared/utils/jobConditions.ts';
import { calculateEstimateSummary } from './estimateEngineV1.ts';

function buildProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'project-1',
    projectNumber: 'P-001',
    projectName: 'Union Baseline Test',
    clientName: 'Client',
    generalContractor: 'GC',
    estimator: 'Estimator',
    bidDate: '2026-03-19',
    proposalDate: '2026-03-19',
    dueDate: '2026-03-19',
    address: 'Kansas City, KS',
    projectType: null,
    projectSize: null,
    floorLevel: null,
    accessDifficulty: null,
    installHeight: null,
    materialHandling: null,
    wallSubstrate: null,
    laborBurdenPercent: 25,
    overheadPercent: 15,
    profitPercent: 10,
    taxPercent: 8.25,
    pricingMode: 'labor_and_material',
    selectedScopeCategories: [],
    preferredBrands: [],
    jobConditions: createDefaultProjectJobConditions(),
    status: 'Draft',
    notes: null,
    specialNotes: null,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
    ...overrides,
  };
}

function buildLine(overrides: Partial<TakeoffLineRecord> = {}): TakeoffLineRecord {
  return {
    id: 'line-1',
    projectId: 'project-1',
    roomId: 'room-1',
    sourceType: 'catalog',
    sourceRef: null,
    description: 'Grab Bar 36 Stainless Steel',
    sku: 'GB-36',
    category: 'Toilet Accessories',
    subcategory: null,
    baseType: null,
    qty: 1,
    unit: 'EA',
    materialCost: 50,
    baseMaterialCost: 50,
    laborMinutes: 60,
    laborCost: 100,
    baseLaborCost: 100,
    pricingSource: 'auto',
    unitSell: 150,
    lineTotal: 150,
    notes: null,
    bundleId: null,
    catalogItemId: 'catalog-1',
    variantId: null,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
    ...overrides,
  };
}

test('union labor is baseline and does not surface as a modifier', () => {
  const project = buildProject();
  const summary = calculateEstimateSummary(project, [buildLine()]);
  const conditionLines = buildProjectConditionSummaryLines(project.jobConditions);

  assert.equal(summary.conditionLaborMultiplier, 1);
  assert.equal(summary.projectConditions.unionLaborBaseline, true);
  assert.equal(summary.conditionAssumptions.some((line) => /union wage/i.test(line)), false);
  assert.equal(conditionLines.some((line) => /union wage/i.test(line)), false);
});

test('night work applies globally to labor totals and labor hours', () => {
  const project = buildProject({
    jobConditions: {
      ...createDefaultProjectJobConditions(),
      installerCount: 2,
      nightWork: true,
      nightWorkLaborCostMultiplier: 0.2,
      nightWorkLaborMinutesMultiplier: 0.1,
    },
  });
  const lines = [
    buildLine({ id: 'line-1', laborCost: 100, baseLaborCost: 100, laborMinutes: 60, unitSell: 150, lineTotal: 150 }),
    buildLine({ id: 'line-2', description: 'Soap Dispenser', sku: 'SD-1', laborCost: 50, baseLaborCost: 50, laborMinutes: 30, materialCost: 25, baseMaterialCost: 25, unitSell: 75, lineTotal: 75 }),
  ];

  const summary = calculateEstimateSummary(project, lines);

  assert.equal(summary.laborSubtotal, 150);
  assert.equal(summary.adjustedLaborSubtotal, 180);
  assert.ok(Math.abs(summary.totalLaborHours - 1.65) < 1e-9);
  assert.equal(summary.durationDays, 1);
  assert.equal(summary.durationWeeks, 0.2);
  assert.equal(summary.conditionLaborMultiplier, 1.2);
  assert.equal(summary.conditionLaborHoursMultiplier, 1.1);
  assert.equal(summary.projectConditions.nightWork, true);
  assert.equal(summary.conditionAssumptions.some((line) => /night work applies to all scoped items/i.test(line)), true);
});

test('labor burden is not added a second time on top of the base labor rate', () => {
  const project = buildProject({
    laborBurdenPercent: 25,
    overheadPercent: 10,
    profitPercent: 10,
    taxPercent: 0,
  });

  const summary = calculateEstimateSummary(project, [buildLine({ materialCost: 50, baseMaterialCost: 50, laborCost: 100, baseLaborCost: 100 })]);

  assert.equal(summary.laborSubtotal, 100);
  assert.equal(summary.burdenAmount, 0);
  assert.equal(summary.lineSubtotal, 150);
  assert.equal(summary.overheadAmount, 15);
  assert.equal(summary.profitAmount, 16.5);
  assert.equal(summary.baseBidTotal, 181.5);
});

test('crew recommendation bumps above one installer for large distributed scope', () => {
  const project = buildProject({
    jobConditions: normalizeProjectJobConditions({
      ...createDefaultProjectJobConditions(),
      installerCount: 1,
    }),
  });
  const lines: TakeoffLineRecord[] = [];
  for (let i = 0; i < 22; i += 1) {
    lines.push(
      buildLine({
        id: `line-${i}`,
        roomId: `room-${i}`,
        description: `Accessory ${i}`,
        laborMinutes: 30,
        qty: 10,
      })
    );
  }
  const summary = calculateEstimateSummary(project, lines);
  assert.ok(summary.crewRecommendation);
  assert.ok(summary.crewRecommendation!.recommendedCrew >= 2);
  assert.ok(summary.crewRecommendation!.daysAtManualCrew >= summary.crewRecommendation!.daysAtRecommendedCrew);
});