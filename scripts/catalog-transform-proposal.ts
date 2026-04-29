/**
 * Phase 3: Safe catalog transformation proposal (read-only).
 *
 * Reads Google Sheets tab `GOOGLE_SHEETS_TAB_ITEMS` (set to `CLEAN_ITEMS`) and produces review CSVs.
 * Does NOT write back to Sheets and does NOT mutate DB.
 *
 * Usage:
 *   GOOGLE_SHEETS_SPREADSHEET_ID=... GOOGLE_SHEETS_TAB_ITEMS=CLEAN_ITEMS npm run catalog:propose
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { normalizeStructuredModifiers } from '../src/server/services/pricing/structuredModifiers.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'reports', 'catalog-transform-proposal');

['.env', '.env.local'].forEach((fileName) => {
  const fullPath = path.join(REPO_ROOT, fileName);
  if (fs.existsSync(fullPath)) dotenv.config({ path: fullPath, override: false });
});

type CleanItemRow = {
  sku: string;
  category: string;
  manufacturer: string;
  model: string;
  series: string;
  description: string;
  unit: string;
  baseMaterialCost: string;
  baseLabor: string;
  active: string;
};

type ProposedCanonical = {
  canonicalSku: string;
  category: string;
  manufacturer: string;
  model: string;
  series: string;
  description: string;
  sampleSkus: string[];
  confidence: number;
  reason: string;
};

type ProposedAlias = {
  aliasText: string;
  aliasKind: string;
  canonicalSku: string;
  attributesJson: string;
  confidence: number;
};

type ProposedAttribute = {
  canonicalSku: string;
  attributeKey: string;
  value: string;
  sourceSku: string;
  confidence: number;
};

type ProposedUomFix = {
  sku: string;
  currentUom: string;
  proposedUom: string;
  confidence: number;
  reason: string;
};

type NeedsReview = {
  sku: string;
  issue: string;
  details: string;
  confidence: number;
};

type CleanModifierRow = {
  modifierKey: string;
  name: string;
  appliesToCategories: string;
  addLaborMinutes: string;
  addMaterialCost: string;
  percentLabor: string;
  percentMaterial: string;
  active: string;
};

type ProposedModifierFix = {
  modifierKey: string;
  issue: string;
  details: string;
  structuredKey: string;
  recommendation: string;
  confidence: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeHeader(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeCell(v: string): string {
  const s = v.replace(/\"/g, '\"\"');
  if (/[\",\\n\\r]/.test(s)) return `\"${s}\"`;
  return s;
}

function writeCsv(fileName: string, header: string[], dataRows: string[][]): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const lines = [header.join(',')];
  for (const r of dataRows) lines.push(r.map((c) => escapeCell(String(c ?? ''))).join(','));
  const out = path.join(OUT_DIR, fileName);
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(`Wrote ${path.relative(REPO_ROOT, out)} (${dataRows.length} rows)`);
}

function buildAuth(): JWT {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
  const serviceAccountFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;

  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);
    return new JWT({
      email: parsed.client_email,
      key: String(parsed.private_key || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }

  if (serviceAccountFile) {
    const parsed = JSON.parse(fs.readFileSync(serviceAccountFile, 'utf8'));
    return new JWT({
      email: parsed.client_email,
      key: String(parsed.private_key || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('Missing Google Sheets credentials. Set GOOGLE_SERVICE_ACCOUNT or GOOGLE_SERVICE_ACCOUNT_FILE.');
  }
  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

function getSpreadsheetId(): string {
  const id = String(process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '').trim();
  if (!id) throw new Error('Missing GOOGLE_SHEETS_SPREADSHEET_ID.');
  return id;
}

function getItemsTab(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_ITEMS || 'CLEAN_ITEMS').trim() || 'CLEAN_ITEMS';
}

function getModifiersTab(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_MODIFIERS || 'CLEAN_MODIFIERS').trim() || 'CLEAN_MODIFIERS';
}

const VARIANT_SKU_TOKENS = new Set([
  'SS',
  'S/S',
  'MB',
  'MATTEBLACK',
  'BLK',
  'BLACK',
  'SURFACE',
  'SURF',
  'RECESSED',
  'RECESS',
  'HDPE',
  'PHENOLIC',
  'PC',
  'POWDER',
  'ADA',
]);

const FINISH_TOKENS = [
  'stainless',
  'ss',
  's/s',
  'satin',
  'polished',
  'matte black',
  'black',
  'white',
  'anodized',
] as const;

const MOUNT_TOKENS = ['recessed', 'semi-recessed', 'surface', 'surface mounted', 'wall mounted', 'floor mounted'] as const;

const TIER_TOKENS = [
  /\b[1-6]\s*t\b/i,
  /\b(single|double|triple|quad|five|six)\s*tier\b/i,
  /\b(1|2|3|4|5|6)\s*tier\b/i,
] as const;

const FINISH_MAP: Array<[RegExp, string]> = [
  [/\b(stainless|s[\\/]s|ss)\b/i, 'stainless'],
  [/\bmatte\s*black\b|\bmb\b/i, 'matte_black'],
  [/\bblack\b/i, 'black'],
  [/\bwhite\b/i, 'white'],
  [/\bchrome\b/i, 'chrome'],
];

const MATERIAL_MAP: Array<[RegExp, string]> = [
  [/\bhdpe\b/i, 'HDPE'],
  [/\bphenolic\b/i, 'phenolic'],
  [/\bstainless\b|\bss\b|\bs[\\/]s\b/i, 'stainless'],
  [/\bpowder\s*coat(ed)?\b|\bpc\b/i, 'powder_coated'],
];

const MOUNT_MAP: Array<[RegExp, string]> = [
  [/\brecess(ed)?\b/i, 'recessed'],
  [/\bsurface\s*mount(ed)?\b|\bsurface\b/i, 'surface'],
  [/\boverhead\s*braced\b/i, 'overhead_braced'],
  [/\bfloor\s*anchored\b/i, 'floor_anchored'],
];

function normSku(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/\\s+/g, '');
}

function splitSkuTokens(sku: string): string[] {
  const raw = sku
    .toUpperCase()
    .replace(/\\s+/g, '')
    .replace(/[^A-Z0-9\\-\\/]/g, '');
  return raw.split(/[-]/g).filter(Boolean);
}

function canonicalSkuFromSku(sku: string): { canonicalSku: string; removed: string[]; method: string } {
  const raw = String(sku || '').trim();
  const n = normSku(raw);
  if (!n) return { canonicalSku: '', removed: [], method: 'empty' };

  // Bobrick-style spacing: B-290 2436 -> canonical B-290
  const spaced = raw.replace(/\s+/g, ' ').trim();
  const bSpaced = spaced.match(/^([A-Za-z]-\d{3,5})\s+(\d{2,4}(?:x\d{2,4})?)$/);
  if (bSpaced) return { canonicalSku: bSpaced[1]!.toUpperCase(), removed: [bSpaced[2]!], method: 'bobrick_space_size' };

  // Grab bars: B6806 36 -> B-6806
  const gb1 = spaced.match(/^B\s*[- ]?\s*(6806)\s+(\d{2,3})$/i);
  if (gb1) return { canonicalSku: `B-${gb1[1]}`, removed: [gb1[2]!], method: 'grab_bar_b6806' };
  // Grab bars: B-6806-36 / B-6806X36 / B6806-36 -> B-6806
  const gb2 = n.match(/^B-?6806(?:X|-)?(\d{2,3})$/i);
  if (gb2) return { canonicalSku: 'B-6806', removed: [gb2[1]!], method: 'grab_bar_b6806_suffix' };

  // ASI families: 8320-001360 -> 8320, 8322-001180 -> 8322
  const asiFamily = n.match(/^(\d{4})-\d{6}$/);
  if (asiFamily) return { canonicalSku: asiFamily[1]!, removed: [n.split('-')[1] || ''], method: 'asi_4digit_6digit' };

  // Bradley Elvari: 5B1-003600 -> 5B1, 6B1-* -> 6B1
  const bradley = n.match(/^([4-7]B[12])-\d+$/);
  if (bradley) return { canonicalSku: bradley[1]!, removed: [n.split('-')[1] || ''], method: 'bradley_elvari' };

  // Generic token stripping (finish/mount/material and sizes)
  const tokens = splitSkuTokens(n);
  if (tokens.length <= 1) return { canonicalSku: n, removed: [], method: 'single_token' };
  const kept: string[] = [];
  const removed: string[] = [];
  for (const t of tokens) {
    const tt = t.replace('/', '');
    if (/^\d{2,4}$/.test(t) || /^\d{2,4}X\d{2,4}$/.test(t)) {
      removed.push(t);
      continue;
    }
    if (VARIANT_SKU_TOKENS.has(t) || VARIANT_SKU_TOKENS.has(tt)) removed.push(t);
    else kept.push(t);
  }
  return { canonicalSku: kept.length ? kept.join('-') : tokens[0]!, removed, method: 'token_strip' };
}

function normalizeText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeModel(input: string): string {
  const t = String(input || '').trim().toUpperCase();
  if (!t) return '';
  return t.replace(/\s+/g, '').replace(/[^A-Z0-9\-]/g, '');
}

function normalizeSeries(input: string): string {
  return normalizeText(input).replace(/\b(series|collection|line)\b/g, '').trim();
}

function stripVariantTokensFromDescription(input: string): { fingerprint: string; removed: string[] } {
  const removed: string[] = [];
  let t = normalizeText(input);

  // sizes
  t = t.replace(/\b\d{1,3}\s*(?:in|inch|inches|")\b/g, (m) => {
    removed.push(m);
    return ' ';
  });
  t = t.replace(/\b\d{2,4}\s*x\s*\d{2,4}\b/g, (m) => {
    removed.push(m);
    return ' ';
  });

  // finishes
  for (const tok of FINISH_TOKENS) {
    const re = new RegExp(`\\b${tok.replace(/\s+/g, '\\\\s*')}\\b`, 'i');
    if (re.test(t)) {
      removed.push(tok);
      t = t.replace(re, ' ');
    }
  }

  // mounts
  for (const tok of MOUNT_TOKENS) {
    const re = new RegExp(`\\b${tok.replace(/\s+/g, '\\\\s*')}\\b`, 'i');
    if (re.test(t)) {
      removed.push(tok);
      t = t.replace(re, ' ');
    }
  }

  // tiers
  for (const re of TIER_TOKENS) {
    if (re.test(t)) {
      removed.push('tier_token');
      t = t.replace(re, ' ');
    }
  }

  // ADA prefix alone is not a family identity
  t = t
    .replace(/\bada\b/g, ' ')
    .replace(/\b(the|and|with|for|of|to)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { fingerprint: t, removed };
}

function isPartitionCategory(row: CleanItemRow): boolean {
  const c = `${row.category} ${row.description}`.toLowerCase();
  return /\bpartition\b|\btoilet\s*partition\b|\bcompartment\b|\bstall\b/.test(c);
}

function isLockerCategory(row: CleanItemRow): boolean {
  const c = `${row.category} ${row.description}`.toLowerCase();
  return /\blocker\b/.test(c);
}

function isSignageCategory(row: CleanItemRow): boolean {
  const c = `${row.category} ${row.description}`.toLowerCase();
  return /\bsign(age)?\b/.test(c);
}

function looksLikeComboUnit(row: CleanItemRow): boolean {
  const t = `${row.sku} ${row.description}`.toLowerCase();
  return /\b(combo|combination)\b/.test(t) || (/\bpaper\s*towel\b/.test(t) && /\bwaste\b/.test(t));
}

function groupingKey(row: CleanItemRow): {
  key: string;
  canonicalSku: string;
  removedSkuTokens: string[];
  method: string;
  descFingerprint: string;
} {
  const sku = String(row.sku || '').trim();
  const { canonicalSku, removed, method } = canonicalSkuFromSku(sku);
  const mfr = normalizeText(row.manufacturer);
  const model = normalizeModel(row.model);
  const series = normalizeSeries(row.series);
  const { fingerprint } = stripVariantTokensFromDescription(row.description);

  const attrs = inferAttributes(row);
  const materialGuard = isPartitionCategory(row) ? `|mat:${attrs.material || ''}` : '';
  const mountGuard = attrs.mounting ? `|mount:${attrs.mounting}` : '';
  const signageGuard = isSignageCategory(row) ? `|sig:${fingerprint.slice(0, 24)}` : '';
  const lockerGuard = isLockerCategory(row) ? `|lock:${fingerprint.slice(0, 24)}` : '';

  const skuKeyOk = canonicalSku && (method !== 'single_token' || removed.length > 0);
  if (skuKeyOk) {
    return {
      key: `sku|${canonicalSku}|mfr:${mfr}${materialGuard}${mountGuard}${signageGuard}${lockerGuard}`,
      canonicalSku,
      removedSkuTokens: removed,
      method,
      descFingerprint: fingerprint,
    };
  }

  return {
    key: `fam|mfr:${mfr}|model:${model}|series:${series}|desc:${fingerprint.slice(0, 48)}${materialGuard}${mountGuard}${signageGuard}${lockerGuard}`,
    canonicalSku: canonicalSku || normSku(sku),
    removedSkuTokens: removed,
    method: `fallback_${method}`,
    descFingerprint: fingerprint,
  };
}

function extractSize(text: string): string | null {
  const t = text;
  const m1 = t.match(/\b(\d{1,3})\s*(?:\"|in\b|inch(?:es)?\b)\b/i);
  if (m1) return `${m1[1]}in`;
  const m2 = t.match(/\b(\d{1,3})\s*x\s*(\d{1,3})\b/i);
  if (m2) return `${m2[1]}x${m2[2]}`;
  return null;
}

function firstMatch(map: Array<[RegExp, string]>, text: string): string | null {
  for (const [re, v] of map) {
    if (re.test(text)) return v;
  }
  return null;
}

function inferAttributes(row: CleanItemRow): Record<string, string> {
  const hay = `${row.sku} ${row.description} ${row.model} ${row.series}`.trim();
  const attrs: Record<string, string> = {};
  const finish = firstMatch(FINISH_MAP, hay);
  const material = firstMatch(MATERIAL_MAP, hay);
  const mounting = firstMatch(MOUNT_MAP, hay);
  const size = extractSize(hay);
  if (finish) attrs.finish = finish;
  if (material) attrs.material = material;
  if (mounting) attrs.mounting = mounting;
  if (size) attrs.size = size;
  if (/\bada\b/i.test(hay)) attrs.compliance = 'ADA';
  if (/\bfire\b/i.test(hay)) attrs.compliance = attrs.compliance ? `${attrs.compliance}|fire` : 'fire';
  return attrs;
}

function uomFix(row: CleanItemRow): ProposedUomFix | null {
  const u = String(row.unit || '').trim().toUpperCase() || 'EA';
  const t = `${row.category} ${row.description}`.toLowerCase();

  // Wall protection / rails often LF
  if (u === 'EA' && /wall\s*protec|crash\s*rail|corner\s*guard|chair\s*rail|hand\s*rail\b/.test(t)) {
    return { sku: row.sku, currentUom: u, proposedUom: 'LF', confidence: 0.86, reason: 'Wall protection/rail keywords' };
  }

  // Partitions often STALL/COMPARTMENT, not EA
  if (u === 'EA' && /(toilet\s*partition|partition|compartment|stall)/.test(t) && /(hdpe|phenolic|stainless|pilaster|overhead|braced)/.test(t)) {
    return { sku: row.sku, currentUom: u, proposedUom: 'STALL', confidence: 0.86, reason: 'Partition keywords' };
  }

  return null;
}

function confidenceForGroup(groupSize: number, row: CleanItemRow, attrs: Record<string, string>, removedSkuTokens: string[]): number {
  let c = 0.74;
  if (groupSize >= 2) c += 0.08;
  if (Object.keys(attrs).length >= 2) c += 0.05;
  if (removedSkuTokens.length >= 1) c += 0.03;
  if (attrs.size) c += 0.03;
  if (!String(row.sku || '').trim()) c -= 0.2;
  if (!String(row.description || '').trim()) c -= 0.1;
  if (!String(row.category || '').trim()) c -= 0.05;
  return clamp01(c);
}

function findColumn(headers: string[], aliases: string[]): number | null {
  const norm = headers.map(normalizeHeader);
  const wanted = aliases.map(normalizeHeader);
  for (let i = 0; i < norm.length; i += 1) {
    if (wanted.includes(norm[i]!)) return i;
  }
  return null;
}

function parseRows(values: string[][]): CleanItemRow[] {
  if (!values.length) return [];
  const headers = values[0]!.map((h) => String(h ?? '').trim());
  const idx = (aliases: string[]) => findColumn(headers, aliases);

  const skuCol = idx(['SKU', 'Item SKU', 'Item Code']);
  const catCol = idx(['Category', 'Scope Category']);
  const mfrCol = idx(['Manufacturer', 'Mfr', 'Mfg']);
  const modelCol = idx(['Model', 'Model Number']);
  const seriesCol = idx(['Series']);
  const descCol = idx(['Description', 'Item Description']);
  const unitCol = idx(['Unit', 'UOM', 'Base Unit']);
  const matCol = idx(['BaseMaterialCost', 'Base Material Cost', 'Material Cost', 'Base Material']);
  const laborCol = idx(['BaseLabor', 'Base Labor', 'BaseLaborMinutes', 'Base Labor Minutes', 'Labor Minutes']);
  const activeCol = idx(['Active', 'Is Active', 'Enabled']);

  if (skuCol == null || descCol == null || unitCol == null) {
    throw new Error(`Missing required headers. Need at least SKU, Description, Unit. Got: ${headers.join(', ')}`);
  }

  const rows: CleanItemRow[] = [];
  for (let r = 1; r < values.length; r += 1) {
    const row = values[r]!;
    const sku = String(row[skuCol] ?? '').trim();
    const description = String(row[descCol] ?? '').trim();
    if (!sku && !description) continue;
    rows.push({
      sku,
      category: String(catCol != null ? row[catCol] ?? '' : '').trim(),
      manufacturer: String(mfrCol != null ? row[mfrCol] ?? '' : '').trim(),
      model: String(modelCol != null ? row[modelCol] ?? '' : '').trim(),
      series: String(seriesCol != null ? row[seriesCol] ?? '' : '').trim(),
      description,
      unit: String(row[unitCol] ?? '').trim(),
      baseMaterialCost: String(matCol != null ? row[matCol] ?? '' : '').trim(),
      baseLabor: String(laborCol != null ? row[laborCol] ?? '' : '').trim(),
      active: String(activeCol != null ? row[activeCol] ?? '' : '').trim(),
    });
  }
  return rows;
}

function parseModifiers(values: string[][]): CleanModifierRow[] {
  if (!values.length) return [];
  const headers = values[0]!.map((h) => String(h ?? '').trim());
  const idx = (aliases: string[]) => findColumn(headers, aliases);
  const keyCol = idx(['ModifierKey', 'Modifier Key', 'Key']);
  const nameCol = idx(['Name', 'Label', 'Modifier']);
  const descCol = idx(['Description', 'Details', 'Notes']);
  const catCol = idx(['AppliesToCategories', 'Applies To Categories', 'Categories']);
  const addLaborCol = idx(['AddLaborMinutes', 'Add Labor Minutes']);
  const addMatCol = idx(['AddMaterialCost', 'Add Material Cost']);
  const pctLaborCol = idx(['PercentLabor', 'Percent Labor']);
  const pctMatCol = idx(['PercentMaterial', 'Percent Material']);
  const activeCol = idx(['Active', 'Enabled']);
  if (keyCol == null) return [];
  const out: CleanModifierRow[] = [];
  for (let r = 1; r < values.length; r += 1) {
    const row = values[r]!;
    const key = String(row[keyCol] ?? '').trim();
    const name = String(nameCol != null ? row[nameCol] ?? '' : descCol != null ? row[descCol] ?? '' : '').trim();
    if (!key && !name) continue;
    out.push({
      modifierKey: key,
      name,
      appliesToCategories: String(catCol != null ? row[catCol] ?? '' : '').trim(),
      addLaborMinutes: String(addLaborCol != null ? row[addLaborCol] ?? '' : '').trim(),
      addMaterialCost: String(addMatCol != null ? row[addMatCol] ?? '' : '').trim(),
      percentLabor: String(pctLaborCol != null ? row[pctLaborCol] ?? '' : '').trim(),
      percentMaterial: String(pctMatCol != null ? row[pctMatCol] ?? '' : '').trim(),
      active: String(activeCol != null ? row[activeCol] ?? '' : '').trim(),
    });
  }
  return out;
}

function proposeModifierFixes(mods: CleanModifierRow[]): ProposedModifierFix[] {
  const active = mods.filter((m) => {
    const v = String(m.active || '').trim().toLowerCase();
    if (!v) return true;
    return ['true', '1', 'yes', 'y', 'active'].includes(v);
  });
  const fixes: ProposedModifierFix[] = [];

  const normLabel = (s: string) => normalizeText(s).replace(/\b(add|deduct|upgrade|option)\b/g, '').trim();
  const byLabel = new Map<string, CleanModifierRow[]>();
  for (const m of active) {
    const k = normLabel(m.name);
    if (!k) continue;
    if (!byLabel.has(k)) byLabel.set(k, []);
    byLabel.get(k)!.push(m);
  }
  for (const [k, list] of byLabel) {
    const uniqKeys = Array.from(new Set(list.map((x) => x.modifierKey).filter(Boolean)));
    if (uniqKeys.length >= 2) {
      fixes.push({
        modifierKey: uniqKeys[0]!,
        issue: 'duplicate_modifier_labels',
        details: `label_key=${k} keys=${uniqKeys.join('|')}`,
        structuredKey: '',
        recommendation: 'dedupe_or_merge',
        confidence: 0.9,
      });
    }
  }

  for (const m of active) {
    const normalized = normalizeStructuredModifiers({ modifierStrings: [m.name], description: m.name, notes: [] });
    const structuredKeys = Array.from(new Set([
      ...normalized.installModifiers,
      ...normalized.internalConditions,
      ...normalized.proposalVisibleOptions,
      ...normalized.productAttributes,
    ]));

    // Map free-text modifiers to structured keys (first pass).
    if (structuredKeys.length) {
      fixes.push({
        modifierKey: m.modifierKey,
        issue: 'maps_to_structured_key',
        details: `name=${m.name}`,
        structuredKey: structuredKeys.join('|'),
        recommendation: normalized.installModifiers.length
          ? 'pricing_modifier'
          : normalized.productAttributes.length
            ? 'attribute_only_unless_cost_impacting'
            : normalized.internalConditions.length
              ? 'internal_condition'
              : 'proposal_visible_option',
        confidence: 0.78,
      });
    } else if (normalizeText(m.name).length >= 4) {
      fixes.push({
        modifierKey: m.modifierKey,
        issue: 'obsolete_or_free_text_modifier',
        details: `name=${m.name}`,
        structuredKey: '',
        recommendation: 'needs_mapping_or_retire',
        confidence: 0.55,
      });
    }

    // Conflicting labels (single modifier that implies multiple mutually exclusive install states).
    if (normalized.reviewFlags.includes('mount_type_conflict')) {
      fixes.push({
        modifierKey: m.modifierKey,
        issue: 'conflicting_labels',
        details: `name=${m.name} flags=${normalized.reviewFlags.join('|')}`,
        structuredKey: structuredKeys.join('|'),
        recommendation: 'split_into_separate_modifiers',
        confidence: 0.85,
      });
    }

    const addMat = Number(String(m.addMaterialCost || '').replace(/[$,]/g, ''));
    const pctMat = Number(String(m.percentMaterial || '').replace(/[%]/g, ''));
    const t = `${m.modifierKey} ${m.name}`.toLowerCase();
    if (Number.isFinite(addMat) && addMat > 0 && addMat <= 100 && (!Number.isFinite(pctMat) || pctMat === 0) && /\b%|percent\b/.test(t)) {
      fixes.push({
        modifierKey: m.modifierKey,
        issue: 'percent_maybe_stored_in_flat_field',
        details: `add_material_cost=${m.addMaterialCost} percent_material=${m.percentMaterial} name=${m.name}`,
        structuredKey: '',
        recommendation: 'move_to_percent_material_or_percent_labor',
        confidence: 0.86,
      });
    }
  }

  const seen = new Set<string>();
  return fixes.filter((f) => {
    const k = `${f.modifierKey}|${f.issue}|${f.details}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function readSheet(spreadsheetId: string, tab: string): Promise<string[][]> {
  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A:ZZ` });
  return (resp.data.values || []) as string[][];
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const spreadsheetId = getSpreadsheetId();
  const tab = getItemsTab();
  const modifiersTab = getModifiersTab();
  console.log(`Catalog proposal (read-only) — sheet ${spreadsheetId} tab ${tab}`);

  return Promise.all([readSheet(spreadsheetId, tab), readSheet(spreadsheetId, modifiersTab).catch(() => [])]).then(
    ([values, modValues]) => {
      const rows = parseRows(values);
      const modifiers = parseModifiers(modValues as string[][]);
      const modifierFixes = proposeModifierFixes(modifiers);
    const activeRows = rows.filter((r) => {
      const v = String(r.active || '').trim().toLowerCase();
      if (!v) return true;
      return ['true', '1', 'yes', 'y', 'active'].includes(v);
    });

    // Group rows into canonical candidates
    const groups = new Map<string, CleanItemRow[]>();
    const removedTokensBySku = new Map<string, string[]>();
    const canonicalSkuBySku = new Map<string, string>();
    const groupMetaByKey = new Map<string, { method: string; descFingerprint: string }>();
    for (const r of activeRows) {
      const g = groupingKey(r);
      const key = g.key;
      removedTokensBySku.set(r.sku, g.removedSkuTokens);
      canonicalSkuBySku.set(r.sku, g.canonicalSku);
      if (!groupMetaByKey.has(key)) groupMetaByKey.set(key, { method: g.method, descFingerprint: g.descFingerprint });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    const proposedCanon: ProposedCanonical[] = [];
    const proposedAliases: ProposedAlias[] = [];
    const proposedAttrs: ProposedAttribute[] = [];
    const proposedUom: ProposedUomFix[] = [];
    const needsReview: NeedsReview[] = [];

    for (const [groupKey, members] of groups) {
      const meta = groupMetaByKey.get(groupKey);
      const canonicalSku = (() => {
        const counts = new Map<string, number>();
        for (const m of members) {
          const c = canonicalSkuBySku.get(m.sku) || canonicalSkuFromSku(m.sku).canonicalSku;
          if (!c) continue;
          counts.set(c, (counts.get(c) ?? 0) + 1);
        }
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        return (
          sorted[0]?.[0] ||
          normSku(members[0]?.sku) ||
          stripVariantTokensFromDescription(members[0]?.description || '').fingerprint.slice(0, 32) ||
          'UNKNOWN'
        );
      })();

      // Representative description: longest
      const rep = [...members].sort((a, b) => (b.description || '').length - (a.description || '').length)[0]!;
      const sampleSkus = members.map((m) => String(m.sku || '').trim()).filter(Boolean).slice(0, 8);
      const attrs = inferAttributes(rep);
      let conf = confidenceForGroup(members.length, rep, attrs, removedTokensBySku.get(rep.sku) || []);
      const method = meta?.method || 'unknown';

      const materials = new Set(members.map((m) => inferAttributes(m).material).filter(Boolean));
      const mounts = new Set(members.map((m) => inferAttributes(m).mounting).filter(Boolean));
      const combo = new Set(members.map((m) => (looksLikeComboUnit(m) ? 'combo' : 'single')));
      const conflicts: string[] = [];
      if (materials.size >= 2 && isPartitionCategory(rep)) conflicts.push('material_conflict');
      if (mounts.size >= 2 && (mounts.has('recessed') || mounts.has('surface'))) conflicts.push('mount_type_conflict');
      if (combo.size >= 2) conflicts.push('combo_vs_single_conflict');
      if (conflicts.length) conf = clamp01(conf - 0.18);

      const reasonParts = [
        members.length >= 2 ? 'grouped' : 'single_row',
        `method=${method}`,
        Object.keys(attrs).length ? 'attrs_extracted' : 'no_attrs',
        conflicts.length ? `conflicts=${conflicts.join('|')}` : 'no_conflicts',
      ];

      proposedCanon.push({
        canonicalSku,
        category: rep.category,
        manufacturer: rep.manufacturer,
        model: rep.model,
        series: rep.series,
        description: rep.description,
        sampleSkus,
        confidence: conf,
        reason: reasonParts.join('|'),
      });

      for (const member of members) {
        const memberAttrs = inferAttributes(member);
        const removed = removedTokensBySku.get(member.sku) || [];
        let c2 = confidenceForGroup(members.length, member, memberAttrs, removed);
        if (conflicts.length) c2 = clamp01(c2 - 0.18);

        // Alias proposal: old SKU -> canonical
        const memberSkuN = normSku(member.sku);
        const canonicalN = normSku(canonicalSku);
        const cleanedVariant = memberSkuN.replace(/[^A-Z0-9\-]/g, '');
        const maybeAliasTexts = Array.from(
          new Set([member.sku, memberSkuN, cleanedVariant].map((s) => String(s || '').trim()).filter(Boolean))
        );

        if (member.sku && canonicalSku && memberSkuN !== canonicalN) {
          proposedAliases.push({
            aliasText: member.sku,
            aliasKind: 'sku',
            canonicalSku,
            attributesJson: JSON.stringify(memberAttrs),
            confidence: c2,
          });
          for (const a of maybeAliasTexts) {
            if (normSku(a) === memberSkuN) continue;
            if (normSku(a) === canonicalN) continue;
            if (a.length <= 2) continue;
            proposedAliases.push({
              aliasText: a,
              aliasKind: 'sku_variant',
              canonicalSku,
              attributesJson: JSON.stringify(memberAttrs),
              confidence: clamp01(c2 - 0.03),
            });
          }
        }

        // Attribute proposals (extensible layer)
        for (const [k, v] of Object.entries(memberAttrs)) {
          proposedAttrs.push({
            canonicalSku,
            attributeKey: k,
            value: v,
            sourceSku: member.sku,
            confidence: c2,
          });
        }

        // UOM proposals
        const fix = uomFix(member);
        if (fix) proposedUom.push(fix);

        // Review flags
        if (conflicts.length) {
          needsReview.push({
            sku: member.sku || canonicalSku,
            issue: conflicts[0] || 'ambiguous_family',
            details: `canonical=${canonicalSku} conflicts=${conflicts.join('|')} groupSize=${members.length}`,
            confidence: clamp01(c2 - 0.05),
          });
        }
        if (c2 < 0.85) {
          needsReview.push({
            sku: member.sku || canonicalSku,
            issue: 'weak_canonical_candidate',
            details: `canonical=${canonicalSku} method=${method} attrs=${Object.keys(memberAttrs).join('|')} desc_fp=${stripVariantTokensFromDescription(member.description).fingerprint.slice(0, 40)}`,
            confidence: c2,
          });
        }
        if (!member.sku) {
          needsReview.push({
            sku: canonicalSku,
            issue: 'missing_sku',
            details: `description=${(member.description || '').slice(0, 140)}`,
            confidence: 0.6,
          });
        }
      }
    }

    // De-dup attributes (canonicalSku + key + value)
    const attrKey = (a: ProposedAttribute) => `${normSku(a.canonicalSku)}|${a.attributeKey}|${String(a.value).toLowerCase()}`;
    const uniqAttrs = new Map<string, ProposedAttribute>();
    for (const a of proposedAttrs) {
      const k = attrKey(a);
      const existing = uniqAttrs.get(k);
      if (!existing || a.confidence > existing.confidence) uniqAttrs.set(k, a);
    }

    // Write outputs
    writeCsv(
      'proposed_canonical_items.csv',
      ['canonical_sku', 'category', 'manufacturer', 'model', 'series', 'description', 'sample_skus', 'confidence', 'reason'],
      proposedCanon
        .sort((a, b) => b.confidence - a.confidence)
        .map((p) => [
          p.canonicalSku,
          p.category,
          p.manufacturer,
          p.model,
          p.series,
          p.description,
          p.sampleSkus.join('|'),
          p.confidence.toFixed(3),
          p.reason,
        ])
    );

    writeCsv(
      'proposed_attributes.csv',
      ['canonical_sku', 'attribute_key', 'value', 'source_sku', 'confidence'],
      Array.from(uniqAttrs.values())
        .sort((a, b) => a.canonicalSku.localeCompare(b.canonicalSku) || a.attributeKey.localeCompare(b.attributeKey))
        .map((a) => [a.canonicalSku, a.attributeKey, a.value, a.sourceSku, a.confidence.toFixed(3)])
    );

    writeCsv(
      'proposed_aliases.csv',
      ['alias_text', 'alias_kind', 'canonical_sku', 'attributes_json', 'confidence'],
      proposedAliases
        .filter((a) => normSku(a.aliasText) !== normSku(a.canonicalSku))
        .sort((a, b) => a.aliasText.localeCompare(b.aliasText))
        .map((a) => [a.aliasText, a.aliasKind, a.canonicalSku, a.attributesJson, a.confidence.toFixed(3)])
    );

    writeCsv(
      'proposed_uom_fixes.csv',
      ['sku', 'current_uom', 'proposed_uom', 'confidence', 'reason'],
      proposedUom
        .sort((a, b) => (a.sku || '').localeCompare(b.sku || ''))
        .map((u) => [u.sku, u.currentUom, u.proposedUom, u.confidence.toFixed(3), u.reason])
    );

    writeCsv(
      'proposed_modifier_fixes.csv',
      ['modifier_key', 'issue', 'details', 'structured_key', 'recommendation', 'confidence'],
      modifierFixes
        .sort((a, b) => a.modifierKey.localeCompare(b.modifierKey) || a.issue.localeCompare(b.issue))
        .map((m) => [m.modifierKey, m.issue, m.details, m.structuredKey, m.recommendation, m.confidence.toFixed(3)])
    );

    writeCsv(
      'needs_human_review.csv',
      ['sku', 'issue', 'details', 'confidence'],
      needsReview
        .sort((a, b) => a.confidence - b.confidence)
        .map((n) => [n.sku, n.issue, n.details, n.confidence.toFixed(3)])
    );

    console.log(`\\nActive rows read: ${activeRows.length}`);
    console.log(`Canonical groups: ${groups.size}`);
    console.log(`Proposed aliases: ${proposedAliases.length}`);
    console.log(`Unique proposed attributes: ${uniqAttrs.size}`);
    console.log(`UOM fixes: ${proposedUom.length}`);
    console.log(`Needs review: ${needsReview.length}`);
    console.log(`Modifier fixes: ${modifierFixes.length} (from ${modifiersTab})`);
    }
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

