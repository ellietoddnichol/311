import test from 'node:test';
import assert from 'node:assert/strict';
import { inferInstallFamily, resolveLaborMinutesWithInstallFamily } from './installFamilyPricing.ts';
import { normalizeStructuredModifiers } from './structuredModifiers.ts';

test('recessed towel/waste gets install family recessed_accessory', () => {
  const normalized = normalizeStructuredModifiers({
    modifierStrings: ['Recessed'],
    description: 'Recessed towel dispenser/waste receptacle combination',
    notes: [],
  });
  const family = inferInstallFamily({
    category: 'Toilet Accessories',
    description: 'Recessed towel dispenser/waste receptacle combination',
    unit: 'EA',
    structuredModifiers: normalized.installModifiers,
  });
  assert.equal(family, 'recessed_accessory');
});

test('crash rail LF gets wall_protection_lf', () => {
  const family = inferInstallFamily({
    category: 'Wall Protection',
    description: 'Crash rail, Acrovyn',
    unit: 'LF',
    structuredModifiers: [],
  });
  assert.equal(family, 'wall_protection_lf');
});

test('Acrovyn sheet SF gets wall_protection_sf', () => {
  const family = inferInstallFamily({
    category: 'Wall Protection',
    description: 'Acrovyn sheet, 4x8',
    unit: 'SF',
    structuredModifiers: [],
  });
  assert.equal(family, 'wall_protection_sf');
});

test('grab bar gets grab_bar', () => {
  const family = inferInstallFamily({
    category: 'Toilet Accessories',
    description: 'Grab Bar 36" SS',
    unit: 'EA',
    structuredModifiers: [],
  });
  assert.equal(family, 'grab_bar');
});

test('locker slope top gets locker_accessory', () => {
  const family = inferInstallFamily({
    category: 'Lockers',
    description: 'Locker slope top accessory',
    unit: 'EA',
    structuredModifiers: [],
  });
  assert.equal(family, 'locker_accessory');
});

test('4C mailbox gets mailbox_4c', () => {
  const family = inferInstallFamily({
    category: 'Mailboxes',
    description: 'Florence 4C mailbox, surface mount',
    unit: 'EA',
    structuredModifiers: [],
  });
  assert.equal(family, 'mailbox_4c');
});

test('matte black mirror stays attribute unless configured as cost-impacting', () => {
  const normalized = normalizeStructuredModifiers({
    modifierStrings: ['Matte Black'],
    description: 'Mirror 24x36 Matte Black frame',
    notes: [],
  });
  assert.equal(normalized.productAttributes.includes('matte_black'), true);
  assert.equal(normalized.installModifiers.includes('matte_black' as any), false);
});

test('recessed + fire-rated does not double count blindly', () => {
  const resolved = resolveLaborMinutesWithInstallFamily({
    catalogLaborMinutes: 0,
    installFamily: 'recessed_accessory',
    structuredModifiers: ['recessed', 'fire_rated'],
  });
  assert.equal(resolved.origin, 'install_family_fallback');
  assert.equal(resolved.reviewFlags.includes('recessed_plus_fire_rated_capped'), true);
});

test('existing_conditions + demo/remove do not duplicate improperly', () => {
  const normalized = normalizeStructuredModifiers({
    modifierStrings: ['Existing conditions', 'Demo/remove existing'],
    description: 'Install accessory',
    notes: [],
  });
  assert.equal(normalized.reviewFlags.includes('existing_conditions_plus_demo_remove'), true);

  const resolved = resolveLaborMinutesWithInstallFamily({
    catalogLaborMinutes: 0,
    installFamily: 'surface_mount_small_accessory',
    structuredModifiers: ['existing_conditions', 'demo_remove_existing'],
  });
  assert.equal(resolved.reviewFlags.includes('existing_conditions_demo_remove_nonstack'), true);
});

test('missing labor falls back to install-family baseline', () => {
  const resolved = resolveLaborMinutesWithInstallFamily({
    catalogLaborMinutes: 0,
    installFamily: 'grab_bar',
    structuredModifiers: [],
  });
  assert.equal(resolved.origin, 'install_family_fallback');
  assert.equal(resolved.laborMinutes > 0, true);
});

