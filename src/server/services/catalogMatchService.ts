import { GoogleGenAI } from '@google/genai';
import type { IntakeParsedLine } from '../../shared/types/intake.ts';

export interface CatalogItem {
  id: string;
  sku: string;
  description: string;
  category: string;
  uom: string;
  baseMaterialCost: number;
  baseLaborMinutes: number;
  tags?: string[];
}

export interface MatchResult {
  matchedCatalogItemId: string | null;
  matchedSku: string | null;
  matchedDescription: string | null;
  matchStatus: IntakeParsedLine['matchStatus'];
  confidence: number;
  matchExplanation: string;
  materialCost: number;
  laborMinutes: number;
}

function normalizeText(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(value: string): string[] {
  return Array.from(new Set(normalizeText(value).split(/\s+/).filter((t) => t.length > 1)));
}

function tokenOverlap(query: string, candidate: string): number {
  const qt = tokenize(query);
  const ct = tokenize(candidate);
  if (qt.length === 0 || ct.length === 0) return 0;
  const cs = new Set(ct);
  const shared = qt.filter((t) => cs.has(t)).length;
  return shared / Math.max(qt.length, ct.length);
}

function scoreCatalogItem(line: Pick<IntakeParsedLine, 'itemCode' | 'itemName' | 'description' | 'category' | 'unit'>, item: CatalogItem): number {
  // 1. Exact SKU/code match
  const lineCode = normalizeText(line.itemCode);
  const itemSku = normalizeText(item.sku);
  if (lineCode && itemSku && lineCode === itemSku) return 1.0;

  // 2. Partial SKU match
  if (lineCode && itemSku && (lineCode.includes(itemSku) || itemSku.includes(lineCode))) return 0.92;

  // 3. Name overlap
  const combinedLineText = [line.itemName, line.description].filter(Boolean).join(' ');
  const descOverlap = tokenOverlap(combinedLineText, item.description);
  const nameScore = descOverlap;

  // 4. Category match bonus
  const catBonus = line.category && item.category &&
    normalizeText(line.category).includes(normalizeText(item.category)) ? 0.1 : 0;

  // 5. Tag/alias match
  let tagBonus = 0;
  if (item.tags && item.tags.length > 0) {
    const lineNorm = normalizeText(combinedLineText);
    const tagMatch = item.tags.some((tag) => lineNorm.includes(normalizeText(tag)));
    if (tagMatch) tagBonus = 0.15;
  }

  // 6. Unit compatibility bonus
  const unitBonus = line.unit && item.uom &&
    normalizeText(line.unit) === normalizeText(item.uom) ? 0.05 : 0;

  return Math.min(1.0, nameScore + catBonus + tagBonus + unitBonus);
}

export async function matchLinesToCatalog(
  lines: Array<Pick<IntakeParsedLine, 'id' | 'itemCode' | 'itemName' | 'description' | 'category' | 'unit'>>,
  catalog: CatalogItem[],
  useGeminiForHardCases = false
): Promise<Map<string, MatchResult>> {
  const results = new Map<string, MatchResult>();
  const hardCases: typeof lines = [];

  const MATCH_THRESHOLD = 0.65;
  const NEEDS_MATCH_THRESHOLD = 0.30;

  for (const line of lines) {
    let bestScore = 0;
    let bestItem: CatalogItem | null = null;

    for (const item of catalog) {
      const score = scoreCatalogItem(line, item);
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    if (bestItem && bestScore >= MATCH_THRESHOLD) {
      results.set(line.id, {
        matchedCatalogItemId: bestItem.id,
        matchedSku: bestItem.sku,
        matchedDescription: bestItem.description,
        matchStatus: 'matched',
        confidence: Math.round(bestScore * 100) / 100,
        matchExplanation: bestScore >= 0.9 ? 'Exact or near-exact match' : `Token overlap score: ${Math.round(bestScore * 100)}%`,
        materialCost: bestItem.baseMaterialCost,
        laborMinutes: bestItem.baseLaborMinutes,
      });
    } else if (bestItem && bestScore >= NEEDS_MATCH_THRESHOLD) {
      results.set(line.id, {
        matchedCatalogItemId: null,
        matchedSku: null,
        matchedDescription: null,
        matchStatus: 'needs_match',
        confidence: Math.round(bestScore * 100) / 100,
        matchExplanation: `Best candidate: "${bestItem.description}" (${Math.round(bestScore * 100)}% confidence - needs review)`,
        materialCost: 0,
        laborMinutes: 0,
      });
      if (useGeminiForHardCases) hardCases.push(line);
    } else {
      results.set(line.id, {
        matchedCatalogItemId: null,
        matchedSku: null,
        matchedDescription: null,
        matchStatus: 'needs_match',
        confidence: 0,
        matchExplanation: 'No catalog match found',
        materialCost: 0,
        laborMinutes: 0,
      });
      if (useGeminiForHardCases) hardCases.push(line);
    }
  }

  // Gemini-assisted matching for hard cases
  if (useGeminiForHardCases && hardCases.length > 0) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
    if (apiKey) {
      try {
        await matchHardCasesWithGemini(hardCases, catalog, results, apiKey);
      } catch {
        // Gemini match enhancement failed; keep deterministic results
      }
    }
  }

  return results;
}

async function matchHardCasesWithGemini(
  lines: Array<Pick<IntakeParsedLine, 'id' | 'itemCode' | 'itemName' | 'description' | 'category' | 'unit'>>,
  catalog: CatalogItem[],
  results: Map<string, MatchResult>,
  apiKey: string
): Promise<void> {
  if (lines.length === 0 || catalog.length === 0) return;

  const modelName = process.env.GEMINI_MATCH_MODEL || process.env.GEMINI_PARSE_MODEL || 'gemini-2.5-flash';
  const ai = new GoogleGenAI({ apiKey });

  const catalogSummary = catalog.slice(0, 200).map((item) => ({
    id: item.id,
    sku: item.sku,
    description: item.description,
    category: item.category,
  }));

  const linesSummary = lines.map((l) => ({
    id: l.id,
    description: l.description,
    itemName: l.itemName,
    itemCode: l.itemCode,
    category: l.category,
  }));

  const prompt = `You are a construction catalog matching expert.
Match each scope line to the most appropriate catalog item.
Only match if you are confident (>70%). If unsure, leave catalogItemId as null.

Catalog items:
${JSON.stringify(catalogSummary)}

Lines to match:
${JSON.stringify(linesSummary)}

Return a JSON array of: { lineId, catalogItemId, confidence, explanation }
where catalogItemId is from the catalog or null if no good match exists.`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' },
  });

  let matches: Array<{ lineId: string; catalogItemId: string | null; confidence: number; explanation: string }> = [];
  try {
    const parsed = JSON.parse(response.text || '[]');
    matches = Array.isArray(parsed) ? parsed : [];
  } catch {
    return;
  }

  for (const match of matches) {
    if (!match.lineId || !match.catalogItemId) continue;
    const catalogItem = catalog.find((c) => c.id === match.catalogItemId);
    if (!catalogItem) continue;
    const confidence = Math.min(1, Math.max(0, Number(match.confidence) || 0.7));
    if (confidence >= 0.65) {
      results.set(match.lineId, {
        matchedCatalogItemId: catalogItem.id,
        matchedSku: catalogItem.sku,
        matchedDescription: catalogItem.description,
        matchStatus: 'matched',
        confidence,
        matchExplanation: `Gemini match: ${match.explanation || 'semantic match'}`,
        materialCost: catalogItem.baseMaterialCost,
        laborMinutes: catalogItem.baseLaborMinutes,
      });
    }
  }
}
