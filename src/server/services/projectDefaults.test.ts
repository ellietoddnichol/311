import assert from 'assert';
import { test } from 'node:test';
import {
  generateBidPackageNumber,
  inferDefaultClientName,
  inferDefaultLocationFromProjectTitle,
  titleStringForInference,
} from './projectDefaults.ts';

test('generateBidPackageNumber is stable for same inputs', () => {
  const id = 'proj-1';
  const name = 'CWA - Example Project';
  const a = generateBidPackageNumber({ projectId: id, projectName: name, now: new Date('2026-01-02T00:00:00Z') });
  const b = generateBidPackageNumber({ projectId: id, projectName: name, now: new Date('2026-01-02T12:00:00Z') });
  assert.equal(a, b);
});

test('inferDefaultClientName returns CWA only on strong token match', () => {
  assert.deepEqual(inferDefaultClientName({ projectName: 'CWA - Lobby Renovation' }), { clientName: 'CWA', reason: 'CWA token' });
  assert.equal(inferDefaultClientName({ projectName: 'Central Warehouse Annex' })?.clientName ?? null, null);
});

test('inferDefaultLocationFromProjectTitle fills only on strong City, ST patterns', () => {
  assert.equal(inferDefaultLocationFromProjectTitle({ projectName: 'Bid - West Clinic - Kansas City, KS' })?.locationLabel ?? null, 'Kansas City, KS');
  assert.equal(inferDefaultLocationFromProjectTitle({ projectName: 'Project X - Austin, TX' })?.locationLabel ?? null, 'Austin, TX');
  assert.equal(inferDefaultLocationFromProjectTitle({ projectName: 'Project X (Denver, CO)' })?.locationLabel ?? null, 'Denver, CO');
  assert.equal(inferDefaultLocationFromProjectTitle({ projectName: 'Project X - Somewhere' }), null);
  assert.equal(inferDefaultLocationFromProjectTitle({ projectName: 'Central Warehouse Annex' }), null);
});

test('titleStringForInference strips controls and collapses whitespace', () => {
  assert.equal(titleStringForInference('  A\u0000 - B  '), 'A - B');
});

