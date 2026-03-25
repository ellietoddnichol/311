import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMetadataFromText, isPlausibleProjectTitle, stripIntakeControlCharacters } from './metadataExtractorService.ts';

test('stripIntakeControlCharacters removes C0 controls but keeps newlines', () => {
  assert.equal(stripIntakeControlCharacters('A\u0000B\u007FC'), 'A B C');
  assert.equal(stripIntakeControlCharacters('line1\nline2'), 'line1\nline2');
});

test('isPlausibleProjectTitle rejects PDF mojibake-like strings', () => {
  assert.equal(isPlausibleProjectTitle('F¼Æ"%1Ð½zÎÔ¹ùÝkfWp·+P$nWà`Ó'), false);
  assert.equal(isPlausibleProjectTitle('\x00\x01\x02garbage'), false);
});

test('isPlausibleProjectTitle accepts normal job names', () => {
  assert.equal(isPlausibleProjectTitle('Civic Center Refresh'), true);
  assert.equal(isPlausibleProjectTitle('FedEx Sort KCMO'), true);
});

test('extractMetadataFromText does not use mojibake as project name', () => {
  const meta = extractMetadataFromText('F¼Æ"%1Ð½zÎÔ¹ùÝkfWp·+P$nWà`Ó');
  assert.equal(meta.projectName, '');
});

test('extractMetadataFromText still finds labeled project name', () => {
  const meta = extractMetadataFromText('Project Name: North Plaza Build\nClient: ACME');
  assert.equal(meta.projectName, 'North Plaza Build');
});
