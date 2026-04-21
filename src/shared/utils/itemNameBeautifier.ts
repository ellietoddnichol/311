/**
 * Item name normalization / beautification for Division 10 estimating.
 *
 * Given messy raw item strings from imports, vendor lists, or typed entries,
 * this produces:
 *   - rawName:            untouched original
 *   - beautifiedName:     professional, user-facing label
 *   - normalizedSearchName: lowercased, punctuation-reduced for matching/dedupe
 *   - parsedAttributes:   structured attributes discovered in the text
 *
 * Rules:
 *   - Title case display
 *   - Dimensions like 18 inch / 18in -> 18"
 *   - Finish standardization (ss -> Stainless Steel, peened -> Peened Finish, etc.)
 *   - Mounting standardization (sm / surface -> Surface Mounted, rec / recessed -> Recessed)
 *   - Consistent category naming across common Div 10 items
 *   - Ordering: base item, size, finish, mounting/config, brand
 *   - Avoid ugly duplicates ("Grab Bar Grab Bar 18 Stainless")
 *
 * The implementation is intentionally conservative: when confidence is low the
 * beautifier still cleans up formatting without aggressively rewriting meaning.
 */

export interface BeautifiedName {
  rawName: string;
  beautifiedName: string;
  normalizedSearchName: string;
  parsedAttributes: {
    category: string | null;
    sizeInches: string | null;
    finish: string | null;
    mounting: string | null;
    manufacturer: string | null;
    model: string | null;
    configuration: string[];
  };
  confidence: 'low' | 'medium' | 'high';
}

interface BeautifyOptions {
  /** Explicit manufacturer if already known from a column or upstream source. */
  manufacturer?: string | null;
  /** Explicit model / SKU if already known. */
  model?: string | null;
  /** Explicit finish if already known. */
  finish?: string | null;
  /** Preferred brands hint from project. When present and matched, boost confidence. */
  preferredBrands?: string[];
}

const MANUFACTURER_CANONICAL: Record<string, string> = {
  bobrick: 'Bobrick',
  'american specialties': 'ASI',
  asi: 'ASI',
  'asi group': 'ASI',
  asigroup: 'ASI',
  'asi american specialties': 'ASI',
  bradley: 'Bradley',
  gamco: 'Gamco',
  'koala kare': 'Koala Kare',
  koalakare: 'Koala Kare',
  koala: 'Koala Kare',
  scranton: 'Scranton Products',
  'scranton products': 'Scranton Products',
  'hadrian': 'Hadrian',
  'general partitions': 'General Partitions',
  'accurate partitions': 'Accurate Partitions',
  global: 'Global Partitions',
  'global partitions': 'Global Partitions',
  'metpar': 'Metpar',
  'salsbury': 'Salsbury Industries',
  'salsbury industries': 'Salsbury Industries',
  'list industries': 'List Industries',
  'lyon': 'Lyon',
  'penco': 'Penco',
  'tennsco': 'Tennsco',
  'republic': 'Republic Storage',
  'dryer': 'World Dryer',
  'world dryer': 'World Dryer',
  'excel dryer': 'Excel Dryer',
  'xlerator': 'Excel Dryer',
  'dyson': 'Dyson',
  'takex': 'Takex',
  asipartitions: 'ASI Accurate Partitions',
};

const FINISH_CANONICAL: Array<[RegExp, string]> = [
  [/\bstainless steel\b/i, 'Stainless Steel'],
  [/\bs\.s\.?\b|\bss\b/i, 'Stainless Steel'],
  [/\bsatin(\s+finish)?\b/i, 'Satin Finish'],
  [/\bpolished(\s+finish)?\b/i, 'Polished Finish'],
  [/\bpeened(\s+finish)?\b/i, 'Peened Finish'],
  [/\bbrushed\b/i, 'Brushed Finish'],
  [/\bmirror\s*polish(ed)?\b/i, 'Mirror Polished'],
  [/\bpowder[\s-]*coat(ed)?\b/i, 'Powder Coated'],
  [/\bwhite\b/i, 'White'],
  [/\bblack\b/i, 'Black'],
  [/\bgr[ae]y\b/i, 'Gray'],
  [/\bchrome\b/i, 'Chrome'],
  [/\bbronze\b/i, 'Bronze'],
  [/\bbrass\b/i, 'Brass'],
  [/\bbeige\b/i, 'Beige'],
];

const MOUNTING_CANONICAL: Array<[RegExp, string]> = [
  [/\brecess(?:ed)?\b|\brec\b/i, 'Recessed'],
  [/\bsemi[\s-]*recess(?:ed)?\b/i, 'Semi-Recessed'],
  [/\bsurface[\s-]*mount(ed)?\b|\bsurface\b|\bsm\b/i, 'Surface Mounted'],
  [/\bwall[\s-]*mount(ed)?\b/i, 'Wall Mounted'],
  [/\bfloor[\s-]*mount(ed)?\b/i, 'Floor Mounted'],
  [/\bpartition[\s-]*mount(ed)?\b/i, 'Partition Mounted'],
  [/\bceiling[\s-]*hung\b|\bceiling[\s-]*mount(ed)?\b/i, 'Ceiling Mounted'],
  [/\boverhead[\s-]*brac(ed|ing)?\b|\boh\b|\bo\.h\.?\b/i, 'Overhead Braced'],
  [/\bfloor[\s-]*anchored\b/i, 'Floor Anchored'],
];

const CATEGORY_CANONICAL: Array<[RegExp, string]> = [
  [/\bgrab\s*bar(s)?\b|\bg\.?\s*b\.?\b/i, 'Grab Bar'],
  [/\bpaper\s*towel.*(waste|trash|receptacle)\b/i, 'Paper Towel / Waste Receptacle Combo'],
  [/\bwaste\s*receptacle\b|\btrash\s*receptacle\b/i, 'Waste Receptacle'],
  [/\bpaper\s*towel\s*dispenser\b|\bptd\b/i, 'Paper Towel Dispenser'],
  [/\bsoap\s*dispenser\b|\bs\.?\s*d\.?\b/i, 'Soap Dispenser'],
  [/\bhand\s*dryer\b|\belectric\s*hand\s*dryer\b/i, 'Hand Dryer'],
  [/\btoilet\s*tissue\s*dispenser\b|\btoilet\s*paper\s*dispenser\b|\btp\s*dispenser\b/i, 'Toilet Tissue Dispenser'],
  [/\bsanitary\s*napkin\s*disposal\b|\bsnd\b|\bnapkin\s*disposal\b/i, 'Sanitary Napkin Disposal'],
  [/\bsanitary\s*napkin\s*vendor\b|\bsnv\b/i, 'Sanitary Napkin Vendor'],
  [/\bseat\s*cover\s*dispenser\b|\bscd\b/i, 'Seat Cover Dispenser'],
  [/\bmirror\b/i, 'Mirror'],
  [/\bbaby\s*chang(ing|e)\s*(station|table)\b|\bkoala\b/i, 'Baby Changing Station'],
  [/\btoilet\s*partition(s)?\b|\bpartition\b/i, 'Toilet Partition'],
  [/\bshower\s*(curtain|rod)\b/i, 'Shower Rod & Curtain'],
  [/\bcorner\s*guard(s)?\b/i, 'Corner Guard'],
  [/\bwall\s*guard(s)?\b|\bhand\s*rail\b|\bhandrail\b/i, 'Wall Guard'],
  [/\bcrash\s*rail\b/i, 'Crash Rail'],
  [/\blocker(s)?\b/i, 'Locker'],
  [/\bbench\b/i, 'Bench'],
  [/\bfire\s*extinguisher\s*cabinet\b|\bfec\b/i, 'Fire Extinguisher Cabinet'],
  [/\bfire\s*extinguisher\b/i, 'Fire Extinguisher'],
  [/\bdirectory\s*sign\b/i, 'Directory Sign'],
  [/\broom\s*(id|identification)?\s*sign\b|\broom\s*sign\b/i, 'Room Identification Sign'],
  [/\bsign(age)?\b/i, 'Sign'],
  [/\btoilet\s*seat\s*cover\b/i, 'Seat Cover Dispenser'],
  [/\brobe\s*hook\b|\bgarment\s*hook\b/i, 'Robe Hook'],
  [/\bshelf\b|\bshelving\b/i, 'Shelf'],
  [/\bcoat\s*hook\b/i, 'Coat Hook'],
];

const CONFIGURATION_CANONICAL: Array<[RegExp, string]> = [
  [/\bsnap\s*flange\b/i, 'Snap Flange'],
  [/\bconcealed\s*mount(ing)?\b/i, 'Concealed Mount'],
  [/\bexposed\s*mount(ing)?\b/i, 'Exposed Mount'],
  [/\bpilaster\s*shoe\b/i, 'Pilaster Shoe'],
  [/\bheavy\s*duty\b|\bhd\b/i, 'Heavy Duty'],
  [/\bada\b/i, 'ADA'],
  [/\bvandal[\s-]*resistant\b/i, 'Vandal Resistant'],
  [/\bbattery\s*operated\b/i, 'Battery Operated'],
  [/\bhard[\s-]*wired\b|\bhardwired\b/i, 'Hardwired'],
  [/\btouchless\b|\bsensor\b|\bautomatic\b/i, 'Touchless'],
  [/\bmanual\b/i, 'Manual'],
  [/\bfoam\b/i, 'Foam'],
  [/\bliquid\b/i, 'Liquid'],
  [/\broll\b/i, 'Roll'],
  [/\bfolded\b|\bmulti[\s-]*fold\b/i, 'Folded'],
  [/\bc[\s-]*fold\b/i, 'C-Fold'],
  [/\bhigh\s*capacity\b/i, 'High Capacity'],
];

// Canonical manufacturer match (case-insensitive startsWith/includes).
function canonicalManufacturer(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (MANUFACTURER_CANONICAL[normalized]) return MANUFACTURER_CANONICAL[normalized];
  for (const key of Object.keys(MANUFACTURER_CANONICAL)) {
    if (normalized === key || normalized.includes(key)) return MANUFACTURER_CANONICAL[key];
  }
  // Unknown brand: title case it politely.
  return titleCase(String(value).trim());
}

function titleCase(input: string): string {
  if (!input) return '';
  const smallWords = new Set(['of', 'and', 'the', 'for', 'with', 'on', 'in', 'at', 'by', 'to', 'a', 'an', 'or']);
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (!word) return word;
      if (/^[a-z]\d|^\d/.test(word)) return word.toUpperCase();
      if (index > 0 && smallWords.has(word)) return word;
      if (/^(asi|ada|hd|oh|ss|gc|tp|ptd|scd|snd|snv|fec|sku)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function normalizeComparable(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/[_/]/g, ' ')
    .replace(/[^a-z0-9\s"'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function standardizeDimensions(input: string): { text: string; sizeInches: string | null } {
  let sizeInches: string | null = null;
  const out = input
    .replace(/(\d+(?:\.\d+)?)\s*(?:inches|inch|in\b|")/gi, (_, value: string) => {
      sizeInches = sizeInches ?? `${value}"`;
      return `${value}"`;
    })
    .replace(/(\d+(?:\.\d+)?)['\u2032]\s*(\d+(?:\.\d+)?)(?:"|in|inch)?/gi, (_match, feet: string, inches: string) => {
      const label = `${feet}'-${inches}"`;
      sizeInches = sizeInches ?? label;
      return label;
    })
    .replace(/\b(\d+(?:\.\d+)?)\s*(ft|feet)\b/gi, (_m, value: string) => {
      sizeInches = sizeInches ?? `${value}'`;
      return `${value}'`;
    });
  return { text: out, sizeInches };
}

function extractFinish(text: string): string | null {
  for (const [pattern, label] of FINISH_CANONICAL) {
    if (pattern.test(text)) return label;
  }
  return null;
}

function extractMounting(text: string): string | null {
  for (const [pattern, label] of MOUNTING_CANONICAL) {
    if (pattern.test(text)) return label;
  }
  return null;
}

function extractCategory(text: string): string | null {
  for (const [pattern, label] of CATEGORY_CANONICAL) {
    if (pattern.test(text)) return label;
  }
  return null;
}

function extractConfiguration(text: string): string[] {
  const hits: string[] = [];
  for (const [pattern, label] of CONFIGURATION_CANONICAL) {
    if (pattern.test(text) && !hits.includes(label)) hits.push(label);
  }
  return hits;
}

function extractManufacturerFromText(text: string): string | null {
  const lowered = text.toLowerCase();
  for (const key of Object.keys(MANUFACTURER_CANONICAL)) {
    // Match whole-word boundaries so "asi" doesn't pick up "basic".
    const pattern = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lowered)) return MANUFACTURER_CANONICAL[key];
  }
  return null;
}

function extractModel(text: string, manufacturer: string | null): string | null {
  // Common Bobrick/ASI style model pattern like B-5806, B5806, B-290, 0390-XX.
  const modelRegex = /\b(?:[A-Z]{1,3}[-\s]?\d{3,5}(?:[-\s]?[A-Z0-9]{1,4})?|\d{3,5}[-\s]?[A-Z0-9]{1,4})\b/;
  const match = text.match(modelRegex);
  if (!match) return null;
  const model = match[0].replace(/\s+/g, '').toUpperCase();
  if (manufacturer && model.toUpperCase() === manufacturer.toUpperCase()) return null;
  return model;
}

function dedupeWords(phrase: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of phrase.split(/\s+/)) {
    const key = word.toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out.join(' ');
}

export function beautifyItemName(rawInput: string, options: BeautifyOptions = {}): BeautifiedName {
  const rawName = String(rawInput || '').trim();
  if (!rawName) {
    return {
      rawName,
      beautifiedName: '',
      normalizedSearchName: '',
      parsedAttributes: {
        category: null,
        sizeInches: null,
        finish: null,
        mounting: null,
        manufacturer: null,
        model: null,
        configuration: [],
      },
      confidence: 'low',
    };
  }

  const cleaned = rawName.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ');
  const { text: withDims, sizeInches: explicitSize } = standardizeDimensions(cleaned);
  const finish = options.finish ? titleCase(options.finish) : extractFinish(withDims);
  const mounting = extractMounting(withDims);
  const category = extractCategory(withDims);

  // Bare-number inch inference for common Div 10 items when no explicit unit was provided.
  // Triggers only when a dimensioned category is present (grab bar, mirror, partition, bench, locker,
  // paper towel / soap / dispenser, baby changing station).
  let sizeInches = explicitSize;
  if (!sizeInches && category && /grab bar|mirror|partition|bench|locker|dispenser|station/i.test(category)) {
    const bareMatch = cleaned.match(/\b(\d{2,3})\b(?!\s*['"\u2032])/);
    if (bareMatch) {
      const value = Number(bareMatch[1]);
      if (value >= 9 && value <= 120) {
        sizeInches = `${value}"`;
      }
    }
  }
  const configuration = extractConfiguration(withDims);
  const manufacturer = canonicalManufacturer(options.manufacturer) || extractManufacturerFromText(withDims);
  const model = options.model ? String(options.model).trim().toUpperCase() : extractModel(withDims, manufacturer);

  // Order attributes: [category], [size], [finish], [mounting], [configuration...], [— Brand (Model)]
  const parts: string[] = [];
  if (category) parts.push(category);
  if (sizeInches) parts.push(sizeInches);
  if (finish && !/stainless/i.test(category || '')) parts.push(finish);
  if (mounting) parts.push(mounting);
  for (const cfg of configuration) parts.push(cfg);

  let left = parts.filter(Boolean).join(', ');
  if (!left) {
    // Fallback: title case the cleaned text conservatively.
    left = titleCase(withDims);
  }
  left = dedupeWords(left);

  const brandSuffix = manufacturer ? ` — ${manufacturer}${model ? ` (${model})` : ''}` : model ? ` (${model})` : '';
  const beautifiedName = `${left}${brandSuffix}`.replace(/\s{2,}/g, ' ').trim();

  const normalizedSearchName = normalizeComparable(
    [rawName, category, sizeInches, finish, mounting, ...configuration, manufacturer, model].filter(Boolean).join(' ')
  );

  let confidence: BeautifiedName['confidence'] = 'low';
  const signalCount = [category, sizeInches, finish, mounting, manufacturer].filter(Boolean).length;
  if (signalCount >= 3) confidence = 'high';
  else if (signalCount === 2) confidence = 'medium';

  // Preferred-brand alignment boosts confidence when brand was inferred.
  if (manufacturer && options.preferredBrands?.length) {
    const hit = options.preferredBrands.some((brand) =>
      canonicalManufacturer(brand)?.toLowerCase() === manufacturer.toLowerCase()
    );
    if (hit && confidence !== 'high') confidence = confidence === 'low' ? 'medium' : 'high';
  }

  return {
    rawName,
    beautifiedName,
    normalizedSearchName,
    parsedAttributes: {
      category,
      sizeInches,
      finish,
      mounting,
      manufacturer,
      model,
      configuration,
    },
    confidence,
  };
}

/** Convenience: just the beautified display name. */
export function beautifyDisplayName(raw: string, options: BeautifyOptions = {}): string {
  return beautifyItemName(raw, options).beautifiedName || String(raw || '').trim();
}

/** Canonicalize a manufacturer string for storage/match. */
export function canonicalizeManufacturer(value: string | null | undefined): string | null {
  return canonicalManufacturer(value);
}
