import { PricingMode, TakeoffLineRecord } from '../types/estimator';

export interface ProposalScopeSection {
  section: string;
  itemCount: number;
  material: number;
  labor: number;
  total: number;
  highlights: string[];
}

export interface ProposalLineItem {
  id: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  total: number;
}

export interface ProposalScheduleItem {
  id: string;
  section: string;
  description: string;
  quantity: number;
  materialCost: number;
  laborCost: number;
  laborHours: number;
}

export interface ProposalScheduleSection {
  section: string;
  items: ProposalScheduleItem[];
  totalMaterialCost: number;
  totalLaborCost: number;
  totalLaborHours: number;
  sectionTotal: number;
}

export interface ClientFacingPricingRow {
  label: string;
  amount: number;
}

type ProposalPrintMode = 'children_only' | 'parent_only' | 'both';

export type ProposalPrintOptions = {
  expandedParentChildMode?: ProposalPrintMode;
};

function inferLineVisibility(line: TakeoffLineRecord): 'internal_only' | 'customer_visible' | 'optional_or_alt' {
  const explicit = (line as any).proposalVisibility as string | undefined;
  if (explicit === 'internal_only' || explicit === 'customer_visible' || explicit === 'optional_or_alt') return explicit;
  const sourceLineType = String((line as any).sourceLineType || '').toLowerCase();
  const sourceType = String(line.sourceType || '').toLowerCase();
  if (sourceLineType === 'quote_subtotal' || sourceType === 'quote_subtotal') return 'internal_only';
  return 'customer_visible';
}

function cleanProposalDescription(value: string): string {
  let text = String(value || '').trim();
  if (!text) return '';

  const replacements: Array<[RegExp, string]> = [
    [/\brough[_\s-]?opening[_\s-]?check\b/gi, 'Field verify rough openings prior to installation'],
    [/\bblocking[_\s-]?check\b/gi, 'Confirm blocking prior to installation'],
    [/\bfield[_\s-]?verify\b/gi, 'Field verify'],
    [/\belectrical[_\s-]?by[_\s-]?others\b/gi, 'Electrical by others'],
    [/\bconcrete[_\s-]?by[_\s-]?others\b/gi, 'Concrete by others'],
    [/\bexisting[_\s-]?conditions\b/gi, 'Existing conditions'],
    [/\bno[_\s-]?install\b|\bplace[_\s-]?only\b/gi, 'Furnish only'],
  ];
  replacements.forEach(([re, replacement]) => {
    text = text.replace(re, replacement);
  });

  // Remove snake_case tokens that look like internal keys.
  text = text.replace(/\b[a-z]+_[a-z0-9_]+\b/g, (m) => {
    if (/(ada|usps)/i.test(m)) return m.toUpperCase();
    return '';
  });

  text = text.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  return text;
}

function toProposalPrintableLines(lines: TakeoffLineRecord[], options?: ProposalPrintOptions): TakeoffLineRecord[] {
  const mode: ProposalPrintMode = options?.expandedParentChildMode || 'children_only';

  const byParent = new Map<string, TakeoffLineRecord[]>();
  const parents = new Map<string, TakeoffLineRecord>();
  lines.forEach((line) => {
    const parentId = (line as any).parentEstimateLineId as string | null | undefined;
    if (parentId) {
      if (!byParent.has(parentId)) byParent.set(parentId, []);
      byParent.get(parentId)!.push(line);
    }
    parents.set(line.id, line);
  });

  const visible = lines.filter((line) => inferLineVisibility(line) !== 'internal_only');

  const suppressedParents = new Set<string>();
  if (mode === 'children_only') {
    byParent.forEach((_children, parentId) => suppressedParents.add(parentId));
  } else if (mode === 'parent_only') {
    byParent.forEach((children, parentId) => children.forEach((child) => suppressedParents.add(child.id)));
  }

  return visible
    .filter((line) => !suppressedParents.has(line.id))
    .map((line) => {
      const override = (line as any).proposalDescriptionOverride as string | null | undefined;
      const nextDescription = cleanProposalDescription(override?.trim() ? override : line.description);
      return { ...line, description: nextDescription };
    })
    .filter((line) => Boolean(String(line.description || '').trim()));
}

export function isClientFacingLabel(label: string): boolean {
  const normalized = label.toLowerCase().trim();
  if (!normalized) return false;

  const blockedExact = new Set(['uncategorized', 'general scope', 'general', 'internal', 'test']);
  if (blockedExact.has(normalized)) return false;

  const blockedPattern = /(room|area|zone|test|internal|uncategorized|general scope)/i;
  return !blockedPattern.test(normalized);
}

export function splitProposalTextLines(value: string | null | undefined): string[] {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function trimScopeHighlight(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 56) return trimmed;
  return `${trimmed.slice(0, 53).trim()}...`;
}

export function getProposalSectionLabel(line: TakeoffLineRecord): string {
  const rawCategory = (line.category || '').trim();
  const rawSubcategory = (line.subcategory || '').trim();
  const rawBaseType = (line.baseType || '').trim();

  if (isClientFacingLabel(rawCategory)) return rawCategory;
  if (isClientFacingLabel(rawSubcategory)) return rawSubcategory;
  if (isClientFacingLabel(rawBaseType)) return rawBaseType;
  return 'Additional Scope';
}

export function buildProposalScopeBreakout(lines: TakeoffLineRecord[], showMaterial: boolean, showLabor: boolean): ProposalScopeSection[] {
  const printable = toProposalPrintableLines(lines);
  const sectionMap = new Map<string, ProposalScopeSection>();

  printable.forEach((line) => {
    const section = getProposalSectionLabel(line);
    const existing = sectionMap.get(section) || {
      section,
      itemCount: 0,
      material: 0,
      labor: 0,
      total: 0,
      highlights: [],
    };

    existing.itemCount += 1;
    const material = showMaterial ? line.materialCost * line.qty : 0;
    const labor = showLabor ? line.laborCost * line.qty : 0;
    existing.material += material;
    existing.labor += labor;
    existing.total += material + labor;

    if (existing.highlights.length < 4 && line.description) {
      const description = line.description.trim();
      if (description && !existing.highlights.includes(description) && description.length <= 120) {
        existing.highlights.push(description);
      }
    }

    sectionMap.set(section, existing);
  });

  return Array.from(sectionMap.values()).sort((left, right) => right.total - left.total);
}

export function buildProposalLineItems(lines: TakeoffLineRecord[]): ProposalLineItem[] {
  const printable = toProposalPrintableLines(lines);
  const aggregated = new Map<string, ProposalLineItem>();

  printable.forEach((line) => {
    const section = getProposalSectionLabel(line);
    const description = String(line.description || '').trim();
    const unit = String(line.unit || 'EA').trim() || 'EA';
    if (!description) return;

    const key = [section, String(line.sku || '').trim().toLowerCase(), description.toLowerCase(), unit.toLowerCase()].join('|');
    const existing = aggregated.get(key) || {
      id: key,
      section,
      description,
      quantity: 0,
      unit,
      total: 0,
    };

    existing.quantity += Number(line.qty || 0);
    existing.total += Number(line.lineTotal || 0);
    aggregated.set(key, existing);
  });

  return Array.from(aggregated.values())
    .map((line) => ({
      ...line,
      total: Number(line.total.toFixed(2)),
    }))
    .sort((left, right) => left.section.localeCompare(right.section) || left.description.localeCompare(right.description));
}

export function chunkProposalLineItems(lines: ProposalLineItem[], size: number): ProposalLineItem[][] {
  if (size <= 0) return [lines];
  const chunks: ProposalLineItem[][] = [];
  for (let index = 0; index < lines.length; index += size) {
    chunks.push(lines.slice(index, index + size));
  }
  return chunks;
}

export function buildProposalScheduleSections(
  lines: TakeoffLineRecord[],
  showMaterial: boolean,
  showLabor: boolean,
  laborHourMultiplier = 1
): ProposalScheduleSection[] {
  const printable = toProposalPrintableLines(lines);
  const normalizedLaborHourMultiplier = Number.isFinite(laborHourMultiplier) && laborHourMultiplier > 0
    ? laborHourMultiplier
    : 1;
  const sectionMap = new Map<string, Map<string, ProposalScheduleItem>>();

  printable.forEach((line) => {
    const section = getProposalSectionLabel(line);
    const description = String(line.description || '').trim();
    const unit = String(line.unit || 'EA').trim() || 'EA';
    if (!description) return;

    const sectionItems = sectionMap.get(section) || new Map<string, ProposalScheduleItem>();
    const key = [String(line.sku || '').trim().toLowerCase(), description.toLowerCase(), unit.toLowerCase()].join('|');
    const existing = sectionItems.get(key) || {
      id: `${section}|${key}`,
      section,
      description,
      quantity: 0,
      materialCost: 0,
      laborCost: 0,
      laborHours: 0,
    };

    const quantity = Number(line.qty || 0);
    existing.quantity += quantity;
    existing.materialCost += showMaterial ? Number(line.materialCost || 0) * quantity : 0;
    existing.laborCost += showLabor ? Number(line.laborCost || 0) * quantity : 0;
    existing.laborHours += showLabor ? ((Number(line.laborMinutes || 0) * quantity) / 60) * normalizedLaborHourMultiplier : 0;

    sectionItems.set(key, existing);
    sectionMap.set(section, sectionItems);
  });

  return Array.from(sectionMap.entries())
    .map(([section, sectionItems]) => {
      const items = Array.from(sectionItems.values())
        .map((item) => ({
          ...item,
          quantity: Number(item.quantity.toFixed(2)),
          materialCost: Number(item.materialCost.toFixed(2)),
          laborCost: Number(item.laborCost.toFixed(2)),
          laborHours: Number(item.laborHours.toFixed(2)),
        }))
        .sort((left, right) => left.description.localeCompare(right.description));

      const totalMaterialCost = Number(items.reduce((sum, item) => sum + item.materialCost, 0).toFixed(2));
      const totalLaborCost = Number(items.reduce((sum, item) => sum + item.laborCost, 0).toFixed(2));
      const totalLaborHours = Number(items.reduce((sum, item) => sum + item.laborHours, 0).toFixed(2));

      return {
        section,
        items,
        totalMaterialCost,
        totalLaborCost,
        totalLaborHours,
        sectionTotal: Number((totalMaterialCost + totalLaborCost).toFixed(2)),
      };
    })
    .sort((left, right) => right.sectionTotal - left.sectionTotal || left.section.localeCompare(right.section));
}

export function buildClientFacingPricingRows(
  summary: {
    materialSubtotal: number;
    laborSubtotal: number;
    adjustedLaborSubtotal: number;
    baseBidTotal: number;
  },
  pricingMode: PricingMode
): ClientFacingPricingRow[] {
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';
  const materialBase = showMaterial ? Number(summary.materialSubtotal || 0) : 0;
  const laborBase = showLabor ? Number(summary.adjustedLaborSubtotal || summary.laborSubtotal || 0) : 0;
  const visibleBase = materialBase + laborBase;
  const total = Number(summary.baseBidTotal || 0);

  if (!showMaterial && !showLabor) {
    return [{ label: 'Total', amount: total }];
  }

  if (showMaterial && !showLabor) {
    return [{ label: 'Material', amount: total }];
  }

  if (!showMaterial && showLabor) {
    return [{ label: 'Install', amount: total }];
  }

  if (visibleBase <= 0) {
    const splitAmount = Number((total / 2).toFixed(2));
    return [
      { label: 'Material', amount: splitAmount },
      { label: 'Install', amount: Number((total - splitAmount).toFixed(2)) },
    ];
  }

  const materialAmount = Number(((total * materialBase) / visibleBase).toFixed(2));
  return [
    { label: 'Material', amount: materialAmount },
    { label: 'Install', amount: Number((total - materialAmount).toFixed(2)) },
  ];
}