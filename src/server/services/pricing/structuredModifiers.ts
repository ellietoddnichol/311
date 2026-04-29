export type StructuredModifierKey =
  | 'recessed'
  | 'semi_recessed'
  | 'surface_mount'
  | 'stainless_steel'
  | 'matte_black'
  | 'ada'
  | 'fire_rated'
  | 'wet_area'
  | 'heavy_item'
  | 'lift_required'
  | 'high_abuse'
  | 'security'
  | 'existing_conditions'
  | 'electrical_by_others'
  | 'concrete_by_others'
  | 'blocking_check'
  | 'rough_opening_check'
  | 'demo_remove_existing';

export type ModifierClassification = {
  productAttributes: StructuredModifierKey[];
  installModifiers: StructuredModifierKey[];
  proposalVisibleOptions: StructuredModifierKey[];
  internalConditions: StructuredModifierKey[];
  reviewFlags: string[];
  sourceTokens: string[];
};

const TOKEN_RULES: Array<{
  re: RegExp;
  key: StructuredModifierKey;
  bucket: keyof Omit<ModifierClassification, 'reviewFlags' | 'sourceTokens'>;
}> = [
  { re: /\brecess(ed)?\b/i, key: 'recessed', bucket: 'installModifiers' },
  { re: /\bsemi[-\s]?recess(ed)?\b/i, key: 'semi_recessed', bucket: 'installModifiers' },
  { re: /\bsurface[-\s]?mount(ed)?\b|\bwall[-\s]?mounted\b/i, key: 'surface_mount', bucket: 'installModifiers' },
  { re: /\bstainless\b|\bss\b|\bs\/s\b/i, key: 'stainless_steel', bucket: 'productAttributes' },
  { re: /\bmatte\s*black\b|\bmb\b/i, key: 'matte_black', bucket: 'productAttributes' },
  { re: /\bada\b/i, key: 'ada', bucket: 'proposalVisibleOptions' },
  { re: /\bfire[-\s]?rated\b|\bfire\b/i, key: 'fire_rated', bucket: 'proposalVisibleOptions' },
  { re: /\bwet\s*area\b|\bshower\b|\bpool\b/i, key: 'wet_area', bucket: 'internalConditions' },
  { re: /\bheavy\b|\bover\s*\d+\s*lb\b/i, key: 'heavy_item', bucket: 'internalConditions' },
  { re: /\blift\b|\bhoist\b/i, key: 'lift_required', bucket: 'internalConditions' },
  { re: /\bhigh\s*abuse\b|\bvandal\b/i, key: 'high_abuse', bucket: 'internalConditions' },
  { re: /\bsecure\b|\bsecurity\b|\bdetention\b/i, key: 'security', bucket: 'internalConditions' },
  { re: /\bexisting\s*conditions?\b|\bas[-\s]?is\b/i, key: 'existing_conditions', bucket: 'internalConditions' },
  { re: /\belectrical\b.*\bby\s*others\b/i, key: 'electrical_by_others', bucket: 'internalConditions' },
  { re: /\bconcrete\b.*\bby\s*others\b/i, key: 'concrete_by_others', bucket: 'internalConditions' },
  { re: /\bblocking\b/i, key: 'blocking_check', bucket: 'internalConditions' },
  { re: /\brough\s*open(ing)?\b/i, key: 'rough_opening_check', bucket: 'internalConditions' },
  { re: /\bdemo\b|\bremove\b|\bdemolition\b/i, key: 'demo_remove_existing', bucket: 'internalConditions' },
];

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function tokenizeFreeText(text: string): string[] {
  return String(text || '')
    .split(/[|,;]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function normalizeStructuredModifiers(input: {
  defaultModifiers?: string | null;
  modifierStrings?: string[] | null;
  description?: string | null;
  notes?: string[] | string | null;
}): ModifierClassification {
  const sourceTokens = uniq([
    ...tokenizeFreeText(input.defaultModifiers || ''),
    ...((input.modifierStrings || []).flatMap((m) => tokenizeFreeText(m))),
    ...(Array.isArray(input.notes) ? input.notes.flatMap((n) => tokenizeFreeText(n)) : tokenizeFreeText(String(input.notes || ''))),
    ...tokenizeFreeText(input.description || ''),
  ]);

  const out: ModifierClassification = {
    productAttributes: [],
    installModifiers: [],
    proposalVisibleOptions: [],
    internalConditions: [],
    reviewFlags: [],
    sourceTokens,
  };

  for (const token of sourceTokens) {
    for (const rule of TOKEN_RULES) {
      if (rule.re.test(token)) {
        out[rule.bucket].push(rule.key);
      }
    }
  }

  // Conflict / stacking flags
  const installs = new Set(out.installModifiers);
  if (installs.has('recessed') && installs.has('surface_mount')) {
    out.reviewFlags.push('mount_type_conflict');
  }
  if (out.internalConditions.includes('existing_conditions') && out.internalConditions.includes('demo_remove_existing')) {
    out.reviewFlags.push('existing_conditions_plus_demo_remove');
  }
  if (out.internalConditions.includes('heavy_item') && out.internalConditions.includes('lift_required')) {
    out.reviewFlags.push('heavy_item_plus_lift');
  }

  out.productAttributes = uniq(out.productAttributes);
  out.installModifiers = uniq(out.installModifiers);
  out.proposalVisibleOptions = uniq(out.proposalVisibleOptions);
  out.internalConditions = uniq(out.internalConditions);
  out.reviewFlags = uniq(out.reviewFlags);

  return out;
}

