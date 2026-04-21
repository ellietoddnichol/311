import test from 'node:test';
import assert from 'node:assert/strict';
import { beautifyItemName, canonicalizeManufacturer } from './itemNameBeautifier';

test('beautifies grab bar with peened finish and snap flange', () => {
  const result = beautifyItemName('grab bar 18 peened snap flange bobrick');
  assert.match(result.beautifiedName, /^Grab Bar, 18", Peened Finish, Snap Flange — Bobrick/);
  assert.equal(result.parsedAttributes.category, 'Grab Bar');
  assert.equal(result.parsedAttributes.sizeInches, '18"');
  assert.equal(result.parsedAttributes.manufacturer, 'Bobrick');
  assert.equal(result.confidence, 'high');
});

test('beautifies recessed paper towel / waste combo stainless steel Bobrick', () => {
  const result = beautifyItemName('bobrick recessed paper towel waste combo stainless');
  assert.match(result.beautifiedName, /Paper Towel \/ Waste Receptacle Combo/);
  assert.match(result.beautifiedName, /Recessed/);
  assert.match(result.beautifiedName, /— Bobrick$/);
});

test('beautifies toilet partition scranton overhead braced pilaster shoe', () => {
  const result = beautifyItemName('toilet partition scranton 58 h pilaster shoe oh');
  assert.match(result.beautifiedName, /^Toilet Partition/);
  assert.match(result.beautifiedName, /58"/);
  assert.match(result.beautifiedName, /Pilaster Shoe/);
  assert.match(result.beautifiedName, /Overhead Braced/);
  assert.match(result.beautifiedName, /Scranton Products/);
});

test('beautifies koala kare baby station surface mount gray', () => {
  const result = beautifyItemName('koala kare baby station surface mount grey');
  assert.match(result.beautifiedName, /Baby Changing Station/);
  assert.match(result.beautifiedName, /Surface Mounted/);
  assert.match(result.beautifiedName, /Gray/);
  assert.match(result.beautifiedName, /Koala Kare$/);
});

test('avoids ugly word duplication', () => {
  const result = beautifyItemName('grab bar grab bar 18 stainless');
  const count = (result.beautifiedName.match(/Grab Bar/g) || []).length;
  assert.equal(count, 1);
});

test('preserves raw name and returns normalized search text', () => {
  const result = beautifyItemName('  Grab Bar 36" SS  ');
  assert.equal(result.rawName, 'Grab Bar 36" SS');
  assert.ok(result.normalizedSearchName.includes('grab bar'));
  assert.ok(result.normalizedSearchName.includes('stainless'));
});

test('low confidence when no attributes extracted', () => {
  const result = beautifyItemName('misc item');
  assert.equal(result.confidence, 'low');
  assert.ok(result.beautifiedName);
});

test('canonicalizeManufacturer normalizes known aliases', () => {
  assert.equal(canonicalizeManufacturer('american specialties'), 'ASI');
  assert.equal(canonicalizeManufacturer('BOBRICK'), 'Bobrick');
  assert.equal(canonicalizeManufacturer('koala'), 'Koala Kare');
  assert.equal(canonicalizeManufacturer(' Bradley '), 'Bradley');
  assert.equal(canonicalizeManufacturer(''), null);
  assert.equal(canonicalizeManufacturer(null), null);
});

test('preferred brand hint can promote confidence', () => {
  const result = beautifyItemName('soap dispenser bobrick surface', { preferredBrands: ['Bobrick'] });
  assert.equal(result.parsedAttributes.manufacturer, 'Bobrick');
  assert.ok(result.confidence === 'high' || result.confidence === 'medium');
});

test('explicit manufacturer column overrides text extraction', () => {
  const result = beautifyItemName('36 grab bar', { manufacturer: 'Bradley' });
  assert.equal(result.parsedAttributes.manufacturer, 'Bradley');
  assert.match(result.beautifiedName, /Bradley$/);
});
