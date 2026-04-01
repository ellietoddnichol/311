import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceSafeProjectName,
  isPlausibleCustomerFacingProposalText,
  isPlausibleProjectTitle,
  isPlausibleProposalScopeSnippet,
  looksLikeIntakePricingSummaryOrDisclaimerLine,
  looksLikeIntakeSectionHeaderOrTitleLine,
  looksLikePdfExtractionNoiseLine,
  looksLikePdfProposalBoilerplateLine,
} from './intakeTextGuards.ts';

test('looksLikePdfExtractionNoiseLine rejects PDF operator crumbs and mojibake', () => {
  assert.equal(looksLikePdfExtractionNoiseLine('|endobj|'), true);
  assert.equal(looksLikePdfExtractionNoiseLine('|endobj||'), true);
  assert.equal(looksLikePdfExtractionNoiseLine('|type extgstate bm normal ca 1||'), true);
  assert.equal(looksLikePdfExtractionNoiseLine('adobe|d 20260320103237 05 00||'), true);
  assert.equal(looksLikePdfExtractionNoiseLine('adobe|m i c r o s o f t w o r d 2 0 2 4||'), true);
  assert.equal(looksLikePdfExtractionNoiseLine('|l q f 6||'), true);
  assert.equal(looksLikePdfExtractionNoiseLine('6 lt qa f'), true);
  assert.equal(looksLikePdfExtractionNoiseLine('endobj'), true);
  assert.equal(looksLikePdfExtractionNoiseLine('/gs0'), true);
  assert.equal(looksLikePdfExtractionNoiseLine('F¼Æ"%1Ð½zÎÔ¹ùÝkfWp·+P$nWà`Ó'), true);
  assert.equal(looksLikePdfExtractionNoiseLine('4 EA Stainless grab bar 36 inch'), false);
  assert.equal(looksLikePdfExtractionNoiseLine('Division 10 — toilet accessories'), false);
});

test('looksLikeIntakeSectionHeaderOrTitleLine flags column headers and short division headings', () => {
  assert.equal(looksLikeIntakeSectionHeaderOrTitleLine('Item'), true);
  assert.equal(looksLikeIntakeSectionHeaderOrTitleLine('Qty Description Unit'), true);
  assert.equal(looksLikeIntakeSectionHeaderOrTitleLine('Division 10 — toilet accessories'), true);
  assert.equal(looksLikeIntakeSectionHeaderOrTitleLine('SCOPE OF WORK'), true);
  assert.equal(looksLikeIntakeSectionHeaderOrTitleLine('4 EA Stainless grab bar 36 inch'), false);
  assert.equal(
    looksLikeIntakeSectionHeaderOrTitleLine(
      'Division 10 furnish and install accessories per plans and specifications throughout'
    ),
    false
  );
});

test('proposal scope snippets exclude table header ribbons', () => {
  assert.equal(isPlausibleProposalScopeSnippet('Qty Description Unit'), false);
  assert.equal(isPlausibleProposalScopeSnippet('ITEM'), false);
});

test('looksLikeIntakePricingSummaryOrDisclaimerLine drops totals and labor/quote disclaimers', () => {
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('Material: $2765'), true);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('Labor: $1,200.00'), true);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('Subtotal: $4,000'), true);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('IF LABOR IS NEEDED, PLEASE CALL FOR QUOTE'), true);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('Please call our office for pricing on labor.'), true);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('4 EA Stainless grab bar 36 inch'), false);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('Material hoist 1 ton per plans'), false);
});

test('isPlausibleProjectTitle accepts real warehouse-style job names', () => {
  assert.equal(isPlausibleProjectTitle('Black & McDonald Warehouse'), true);
  assert.equal(isPlausibleProjectTitle('K-12 Modernization'), true);
});

test('coerceSafeProjectName replaces mojibake with fallback', () => {
  assert.equal(coerceSafeProjectName('F¼Æ"%1Ð½zÎÔ¹ùÝkfWp·+P$nWà`Ó', 'Imported Project'), 'Imported Project');
  assert.equal(coerceSafeProjectName('Black & McDonald Warehouse', 'Imported Project'), 'Black & McDonald Warehouse');
});

test('looksLikePdfProposalBoilerplateLine drops subcontractor letterhead lines', () => {
  assert.equal(looksLikePdfProposalBoilerplateLine('CWA Specialties Inc.'), true);
  assert.equal(looksLikePdfProposalBoilerplateLine('chad@cwaspecialties.com 913-620-5338'), true);
  assert.equal(looksLikePdfProposalBoilerplateLine('Project: Fire Fighters Hall'), true);
  assert.equal(looksLikePdfProposalBoilerplateLine('Proposal Date: 10-30-2024'), true);
  assert.equal(looksLikePdfProposalBoilerplateLine('nd'), true);
  assert.equal(looksLikePdfProposalBoilerplateLine('Street'), true);
  assert.equal(looksLikePdfProposalBoilerplateLine('2 963 baby change station'), false);
  assert.equal(looksLikePdfProposalBoilerplateLine('1 781 mirror 60x36'), false);
  assert.equal(looksLikePdfProposalBoilerplateLine('Bradley Toilet Acc.'), true);
});

test('proposal scope guards reject PDF decoder garbage used in auto scope summaries', () => {
  const soup =
    'en; 9|5¹ÿf÷ï®ÇÛ[ÅXk@ÆI*¢<; 8XV,ô{t:%¥sSf+£ùrùeÆÒ6_âÃîÌ]uå2¤ÙÂØÛÈ¶¹ÚªaÜüPÚu¬§<$cÂÕ{;ZÔÎÌÞ;°ÅÁ&vtS®Á«2s»-v;';
  assert.equal(isPlausibleProposalScopeSnippet(soup), false);
  assert.equal(isPlausibleCustomerFacingProposalText(`Scope appears to include ${soup}`), false);
  assert.equal(isPlausibleProposalScopeSnippet('4 EA Stainless grab bar 36 inch'), true);
  assert.equal(
    isPlausibleCustomerFacingProposalText('Furnish and install Division 10 per bid documents and field conditions.'),
    true
  );
});
