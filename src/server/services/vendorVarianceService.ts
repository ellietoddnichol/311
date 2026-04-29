import type { TakeoffLineRecord } from '../../shared/types/estimator.ts';

export type VendorSubtotalVarianceFlag =
  | 'high_variance_over'
  | 'high_variance_under'
  | 'too_many_generic_fallbacks'
  | 'too_many_unmatched_lines'
  | 'low_confidence_block'
  | 'bundle_expansion_used';

export type VendorSubtotalVarianceDetailLine = {
  lineId: string;
  description: string;
  qty: number;
  unit: string;
  materialTotal: number;
  sourceLineType: string;
  proposalVisibility: string;
  notes: string | null;
  included: boolean;
  reason: string;
  genericFallback: boolean;
  expandedChild: boolean;
};

export type VendorSubtotalVarianceBlock = {
  blockKey: string;
  vendorLabel: string;
  vendorQuotedMaterialSubtotal: number;
  normalizedEstimatedMaterialSubtotal: number;
  varianceAmount: number;
  variancePercent: number;
  matchedLineCount: number;
  unmatchedLineCount: number;
  genericFallbackLineCount: number;
  expandedLineCount: number;
  confidence: number;
  flags: VendorSubtotalVarianceFlag[];
  details: VendorSubtotalVarianceDetailLine[];
};

export type VendorSubtotalVarianceReport = {
  blocks: VendorSubtotalVarianceBlock[];
  totals: {
    vendorQuotedMaterialSubtotal: number;
    normalizedEstimatedMaterialSubtotal: number;
    varianceAmount: number;
    variancePercent: number;
  };
};

const DEFAULT_THRESHOLDS = {
  warnVariancePct: 0.15,
  strongWarnVariancePct: 0.25,
  warnGenericFallbackPct: 0.35,
  warnUnmatchedPct: 0.25,
  lowConfidence: 0.6,
};

function n(v: unknown): string {
  return String(v ?? '').trim();
}

function safeNumber(v: unknown): number {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function parseMoneyFromDescription(text: string): number | null {
  const m = n(text).match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
  if (!m?.[1]) return null;
  const value = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

export function extractVendorBlockKeyFromNotes(notes: string | null | undefined): { vendorLabel: string; blockKey: string } | null {
  const text = n(notes);
  if (!text) return null;
  const m = text.match(/Vendor block:\s*([^\n\r]+)/i);
  if (!m?.[1]) return null;
  const vendorLabel = m[1].trim();
  if (!vendorLabel) return null;
  return { vendorLabel, blockKey: vendorLabel.toLowerCase() };
}

function inferProposalVisibility(line: TakeoffLineRecord): string {
  return String((line as any).proposalVisibility || '').trim() || 'customer_visible';
}

function inferSourceLineType(line: TakeoffLineRecord): string {
  return String((line as any).sourceLineType || line.sourceType || '').trim() || 'catalog_item';
}

function isExpandedChild(line: TakeoffLineRecord): boolean {
  return Boolean((line as any).parentEstimateLineId) || inferSourceLineType(line) === 'expanded_child';
}

function isGenericFallback(line: TakeoffLineRecord): boolean {
  const sourceLineType = inferSourceLineType(line).toLowerCase();
  if (sourceLineType === 'quote_subtotal' || String(line.sourceType || '').toLowerCase() === 'quote_subtotal') return false;
  // Conservative: if no catalog item id + sku missing/blank, treat as generic fallback pricing.
  const hasCatalog = Boolean(line.catalogItemId);
  const hasSku = Boolean(n(line.sku));
  return !hasCatalog && !hasSku;
}

function isUnmatched(line: TakeoffLineRecord): boolean {
  // "Unmatched" here means it has no catalog backing AND is not a subtotal row.
  const sourceLineType = inferSourceLineType(line).toLowerCase();
  if (sourceLineType === 'quote_subtotal') return false;
  return !line.catalogItemId;
}

function shouldIncludeInMaterialSubtotal(line: TakeoffLineRecord): { include: boolean; reason: string } {
  const sourceLineType = inferSourceLineType(line).toLowerCase();
  if (sourceLineType === 'quote_subtotal' || String(line.sourceType || '').toLowerCase() === 'quote_subtotal') {
    return { include: false, reason: 'quote_subtotal_excluded' };
  }
  // Exclude internal-only add-ins and internal-only lines.
  const visibility = inferProposalVisibility(line).toLowerCase();
  if (visibility === 'internal_only') {
    return { include: false, reason: 'internal_only_excluded' };
  }
  // Include only material-bearing lines (material subtotal comparison).
  const total = safeNumber(line.materialCost) * safeNumber(line.qty);
  if (total <= 0) return { include: false, reason: 'zero_material_excluded' };
  return { include: true, reason: 'included' };
}

export function computeVendorSubtotalVarianceReport(lines: TakeoffLineRecord[], thresholds = DEFAULT_THRESHOLDS): VendorSubtotalVarianceReport {
  const quoteSubtotals = lines
    .filter((line) => inferSourceLineType(line).toLowerCase() === 'quote_subtotal' || String(line.sourceType || '').toLowerCase() === 'quote_subtotal')
    .map((line) => {
      const group = extractVendorBlockKeyFromNotes(line.notes);
      const money = parseMoneyFromDescription(line.description);
      if (!group || money === null) return null;
      return { ...group, lineId: line.id, amount: money };
    })
    .filter(Boolean) as Array<{ vendorLabel: string; blockKey: string; lineId: string; amount: number }>;

  const blocks = new Map<string, VendorSubtotalVarianceBlock>();
  for (const qs of quoteSubtotals) {
    blocks.set(qs.blockKey, {
      blockKey: qs.blockKey,
      vendorLabel: qs.vendorLabel,
      vendorQuotedMaterialSubtotal: qs.amount,
      normalizedEstimatedMaterialSubtotal: 0,
      varianceAmount: 0,
      variancePercent: 0,
      matchedLineCount: 0,
      unmatchedLineCount: 0,
      genericFallbackLineCount: 0,
      expandedLineCount: 0,
      confidence: 0,
      flags: [],
      details: [],
    });
  }

  // If no subtotals, return empty report.
  if (!blocks.size) {
    return {
      blocks: [],
      totals: { vendorQuotedMaterialSubtotal: 0, normalizedEstimatedMaterialSubtotal: 0, varianceAmount: 0, variancePercent: 0 },
    };
  }

  // Allocate lines to blocks by vendor block note.
  const linesWithBlock = lines
    .map((line) => {
      const group = extractVendorBlockKeyFromNotes(line.notes);
      return { line, group };
    })
    .filter((entry) => entry.group && blocks.has(entry.group.blockKey));

  for (const { line, group } of linesWithBlock) {
    const block = blocks.get(group!.blockKey)!;
    const { include, reason } = shouldIncludeInMaterialSubtotal(line);
    const materialTotal = Number((safeNumber(line.materialCost) * safeNumber(line.qty)).toFixed(2));
    const genericFallback = isGenericFallback(line);
    const expandedChild = isExpandedChild(line);
    const unmatched = isUnmatched(line);
    if (include) {
      block.normalizedEstimatedMaterialSubtotal = Number((block.normalizedEstimatedMaterialSubtotal + materialTotal).toFixed(2));
      if (!unmatched) block.matchedLineCount += 1;
    }
    if (unmatched) block.unmatchedLineCount += 1;
    if (genericFallback) block.genericFallbackLineCount += 1;
    if (expandedChild) block.expandedLineCount += 1;

    block.details.push({
      lineId: line.id,
      description: line.description,
      qty: safeNumber(line.qty),
      unit: n(line.unit) || 'EA',
      materialTotal,
      sourceLineType: inferSourceLineType(line),
      proposalVisibility: inferProposalVisibility(line),
      notes: line.notes,
      included: include,
      reason,
      genericFallback,
      expandedChild,
    });
  }

  const outBlocks: VendorSubtotalVarianceBlock[] = [];
  blocks.forEach((block) => {
    block.varianceAmount = Number((block.normalizedEstimatedMaterialSubtotal - block.vendorQuotedMaterialSubtotal).toFixed(2));
    const denom = block.vendorQuotedMaterialSubtotal || 0;
    block.variancePercent = denom > 0 ? Number((block.varianceAmount / denom).toFixed(4)) : 0;

    const totalLines = Math.max(1, block.matchedLineCount + block.unmatchedLineCount);
    const unmatchedPct = block.unmatchedLineCount / totalLines;
    const genericPct = block.genericFallbackLineCount / totalLines;
    const baseConfidence = 0.9 - (unmatchedPct * 0.5) - (genericPct * 0.35);
    block.confidence = Number(Math.max(0, Math.min(1, baseConfidence)).toFixed(2));

    const flags = new Set<VendorSubtotalVarianceFlag>();
    if (block.variancePercent >= thresholds.warnVariancePct) flags.add('high_variance_over');
    if (block.variancePercent <= -thresholds.warnVariancePct) flags.add('high_variance_under');
    if (Math.abs(block.variancePercent) >= thresholds.strongWarnVariancePct) {
      flags.add(block.variancePercent >= 0 ? 'high_variance_over' : 'high_variance_under');
    }
    if (genericPct >= thresholds.warnGenericFallbackPct) flags.add('too_many_generic_fallbacks');
    if (unmatchedPct >= thresholds.warnUnmatchedPct) flags.add('too_many_unmatched_lines');
    if (block.confidence <= thresholds.lowConfidence) flags.add('low_confidence_block');
    if (block.expandedLineCount > 0) flags.add('bundle_expansion_used');
    block.flags = Array.from(flags);

    block.details.sort((a, b) => Number(b.included) - Number(a.included) || b.materialTotal - a.materialTotal);
    outBlocks.push(block);
  });

  outBlocks.sort((a, b) => Math.abs(b.varianceAmount) - Math.abs(a.varianceAmount) || a.vendorLabel.localeCompare(b.vendorLabel));

  const vendorTotal = Number(outBlocks.reduce((sum, b) => sum + b.vendorQuotedMaterialSubtotal, 0).toFixed(2));
  const appTotal = Number(outBlocks.reduce((sum, b) => sum + b.normalizedEstimatedMaterialSubtotal, 0).toFixed(2));
  const varianceAmount = Number((appTotal - vendorTotal).toFixed(2));
  const variancePercent = vendorTotal > 0 ? Number((varianceAmount / vendorTotal).toFixed(4)) : 0;

  return {
    blocks: outBlocks,
    totals: {
      vendorQuotedMaterialSubtotal: vendorTotal,
      normalizedEstimatedMaterialSubtotal: appTotal,
      varianceAmount,
      variancePercent,
    },
  };
}

