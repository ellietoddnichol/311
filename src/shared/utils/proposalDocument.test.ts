import assert from 'node:assert/strict';
import test from 'node:test';
import { formatClientProposalItemDisplay } from './proposalDocument.ts';

test('formatClientProposalItemDisplay: extinguisher with model, weight, and class', () => {
  const out = formatClientProposalItemDisplay('FE05C Cosmic 5lb Extinguisher 3A-40BC', 'FE05C');
  assert.equal(out.title, 'Cosmic Fire Extinguisher');
  assert.ok(out.subtitle?.includes('FE05C'));
  assert.ok(out.subtitle?.includes('5 lb'));
  assert.ok(out.subtitle?.toUpperCase().includes('3A-40BC'));
});

test('formatClientProposalItemDisplay: hyphenated leading model', () => {
  const out = formatClientProposalItemDisplay('GB-36 Grab Bar 36 inch stainless', 'GB-36');
  assert.equal(out.title, 'Grab Bar 36 Inch Stainless');
  assert.match(out.subtitle || '', /GB-36/i);
});

test('formatClientProposalItemDisplay: plain description unchanged except title case', () => {
  const out = formatClientProposalItemDisplay('paper towel dispenser surface mount', null);
  assert.equal(out.title, 'Paper Towel Dispenser Surface Mount');
  assert.equal(out.subtitle, null);
});

test('formatClientProposalItemDisplay: adds finish option without leaking internal labels', () => {
  const out = formatClientProposalItemDisplay('36" grab bar', 'GB-36', [
    { attributeType: 'finish', attributeValue: 'MATTE_BLACK', source: 'inferred' as const },
  ]);
  assert.match(out.title, /Matte Black/);
  assert.ok(!/MATTE_BLACK|attribute_type|catalogAttributeSnapshot|finish:|mounting:|assembly:/i.test(out.title));
});

test('formatClientProposalItemDisplay: adds mounting option when present', () => {
  const out = formatClientProposalItemDisplay('Fire extinguisher cabinet', null, [
    { attributeType: 'mounting', attributeValue: 'RECESSED', source: 'inferred' as const },
  ]);
  assert.match(out.title, /Recessed/);
});

test('formatClientProposalItemDisplay: adds assembly/coating options (concise)', () => {
  const out = formatClientProposalItemDisplay('Single tier locker', null, [
    { attributeType: 'assembly', attributeValue: 'KD', source: 'inferred' as const },
    { attributeType: 'coating', attributeValue: 'ANTIMICROBIAL', source: 'inferred' as const },
  ]);
  assert.match(out.title, /KD Assembly/);
  assert.match(out.title, /Antimicrobial/);
});

test('formatClientProposalItemDisplay: fallback unchanged for no snapshot', () => {
  const base = formatClientProposalItemDisplay('coat hook', null);
  const out = formatClientProposalItemDisplay('coat hook', null, null);
  assert.deepEqual(out, base);
});
