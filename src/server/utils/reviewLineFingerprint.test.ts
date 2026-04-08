import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReviewLineFingerprint } from './reviewLineFingerprint.ts';

test('computeReviewLineFingerprint is stable for same canonical content', () => {
  const a = computeReviewLineFingerprint({
    sourceReference: 'file.xlsx',
    roomName: '  Rest 1 ',
    itemCode: 'ABC',
    itemName: 'Partition',
    description: 'Metal partition',
    quantity: 2,
    unit: 'EA',
  });
  const b = computeReviewLineFingerprint({
    sourceReference: 'file.xlsx',
    roomName: 'rest 1',
    itemCode: 'abc',
    itemName: 'Partition',
    description: 'metal  partition',
    quantity: 2,
    unit: 'ea',
  });
  assert.equal(a, b);
  assert.equal(a.length, 64);
});

test('computeReviewLineFingerprint changes when quantity changes', () => {
  const base = {
    sourceReference: 'f',
    roomName: 'G',
    itemCode: '',
    itemName: 'x',
    description: 'y',
    unit: 'EA',
  };
  assert.notEqual(
    computeReviewLineFingerprint({ ...base, quantity: 1 }),
    computeReviewLineFingerprint({ ...base, quantity: 2 })
  );
});
