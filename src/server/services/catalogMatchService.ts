import { CatalogItem } from '../../types.ts';
import { IntakeMatchCandidate, IntakeParsedLine } from '../../shared/types/intake.ts';
import { createGeminiClient, getGeminiRoutingConfig } from './geminiModelRouter.ts';
import { geminiMatchSelectionSchema } from './structuredExtractionSchemas.ts';
import { enrichUnknownLineFromWeb } from './webEnrichmentService.ts';

function normalize(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value: string): string[] {
  return Array.from(new Set(normalize(value).split(/\s+/).filter((token) => token.length > 1)));
}

function scoreTokenOverlap(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = new Set(tokens(right));
  if (!leftTokens.length || !rightTokens.size) return 0;
  const shared = leftTokens.filter((token) => rightTokens.has(token)).length;
  return shared / Math.max(leftTokens.length, rightTokens.size);
}

function scoreCandidate(line: IntakeParsedLine, item: CatalogItem): IntakeMatchCandidate {
  const normalizedCode = normalize(line.itemCode);
  const normalizedSku = normalize(item.sku);
  const skuExact = normalizedCode && normalizedSku && normalizedCode === normalizedSku;
  const descriptionScore = Math.max(
    scoreTokenOverlap(`${line.itemName} ${line.description}`, item.description),
    scoreTokenOverlap(line.description, `${item.description} ${item.manufacturer || ''} ${item.model || ''}`),
  );
  const categoryScore = line.category && item.category
    ? normalize(line.category) === normalize(item.category)
      ? 1
      : scoreTokenOverlap(line.category, item.category)
    : 0;
  const unitScore = line.unit && item.uom && normalize(line.unit) === normalize(item.uom) ? 1 : 0;
  const score = skuExact
    ? 1
    : Math.min(0.99, (descriptionScore * 0.62) + (categoryScore * 0.2) + (unitScore * 0.1) + (normalizedCode && normalizedSku && normalizedSku.includes(normalizedCode) ? 0.08 : 0));

  return {
    catalogItemId: item.id,
    sku: item.sku,
    description: item.description,
    category: item.category,
    unit: item.uom,
    score,
    reason: skuExact ? 'Exact SKU/item code match.' : `Deterministic similarity from description/category/unit signals (${score.toFixed(2)}).`,
  };
}

async function refineMatchWithGemini(line: IntakeParsedLine, candidates: IntakeMatchCandidate[], enrichmentSummary = '') {
  const routing = getGeminiRoutingConfig();
  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: routing.match.model,
    contents: [{ role: 'user', parts: [{ text: [
      'Choose the best catalog candidate for this parsed construction scope line.',
      'Return JSON only. If no candidate is reliable, leave selectedCatalogItemId blank.',
      `Line: ${JSON.stringify({
        roomArea: line.roomArea,
        category: line.category,
        itemCode: line.itemCode,
        itemName: line.itemName,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
      })}`,
      enrichmentSummary ? `Web clarification: ${enrichmentSummary}` : '',
      `Candidates: ${JSON.stringify(candidates)}`,
    ].filter(Boolean).join('\n') }] }],
    config: {
      temperature: routing.match.temperature,
      responseMimeType: 'application/json',
      responseSchema: geminiMatchSelectionSchema,
    },
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch (_error) {
    parsed = {};
  }

  const selected = candidates.find((candidate) => candidate.catalogItemId === String(parsed.selectedCatalogItemId || '').trim()) || null;
  return {
    selected,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))),
    reason: String(parsed.reason || '').trim(),
  };
}

export interface MatchServiceResult {
  parsedLines: IntakeParsedLine[];
  logs: string[];
  warnings: string[];
  usedWebEnrichment: boolean;
  averageConfidence: number;
}

export async function matchParsedLinesToCatalog(lines: IntakeParsedLine[], catalog: CatalogItem[]): Promise<MatchServiceResult> {
  const logs: string[] = [];
  const warnings: string[] = [];
  const matchedLines: IntakeParsedLine[] = [];
  let usedWebEnrichment = false;
  let geminiMatchCount = 0;

  for (const line of lines) {
    const candidates = catalog
      .map((item) => scoreCandidate(line, item))
      .filter((candidate) => candidate.score > 0.18)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

    const top = candidates[0] || null;
    const second = candidates[1] || null;

    if (top && top.score >= 0.995) {
      matchedLines.push({
        ...line,
        matchStatus: 'matched',
        matchedCatalogItemId: top.catalogItemId,
        matchedSku: top.sku,
        matchReason: top.reason,
        matchScore: top.score,
        matchCandidates: candidates,
      });
      logs.push(`Exact match for ${line.description || line.itemName}: ${top.sku}`);
      continue;
    }

    let enrichment = null;
    if ((!top || top.score < 0.55) && geminiMatchCount < 8) {
      enrichment = await enrichUnknownLineFromWeb(line);
      if (enrichment?.applied) {
        usedWebEnrichment = true;
        logs.push(`Web enrichment used for ${line.description || line.itemName}`);
      }
    }

    if (top && (top.score >= 0.9 || (top.score >= 0.76 && (!second || top.score - second.score >= 0.12)))) {
      matchedLines.push({
        ...line,
        matchStatus: 'matched',
        matchedCatalogItemId: top.catalogItemId,
        matchedSku: top.sku,
        matchReason: top.reason,
        matchScore: top.score,
        matchCandidates: candidates,
        webEnrichment: enrichment || undefined,
      });
      continue;
    }

    if (candidates.length > 0 && geminiMatchCount < 12) {
      geminiMatchCount += 1;
      const geminiDecision = await refineMatchWithGemini(line, candidates, enrichment?.summary || '');
      if (geminiDecision.selected) {
        const selectedStatus = geminiDecision.confidence >= 0.84 ? 'matched' : 'needs_review';
        matchedLines.push({
          ...line,
          matchStatus: selectedStatus,
          matchedCatalogItemId: geminiDecision.selected.catalogItemId,
          matchedSku: geminiDecision.selected.sku,
          matchReason: geminiDecision.reason || geminiDecision.selected.reason,
          matchScore: Math.max(geminiDecision.selected.score, geminiDecision.confidence),
          matchCandidates: candidates,
          webEnrichment: enrichment || undefined,
        });
        continue;
      }
    }

    if (top && top.score >= 0.45) {
      matchedLines.push({
        ...line,
        matchStatus: 'needs_review',
        matchedCatalogItemId: top.catalogItemId,
        matchedSku: top.sku,
        matchReason: `Candidate needs review. ${top.reason}`,
        matchScore: top.score,
        matchCandidates: candidates,
        webEnrichment: enrichment || undefined,
      });
      warnings.push(`Low-confidence match requires review for ${line.description || line.itemName}.`);
      continue;
    }

    matchedLines.push({
      ...line,
      matchStatus: 'unmatched',
      matchedCatalogItemId: null,
      matchedSku: null,
      matchReason: enrichment?.summary ? `No confident catalog match. ${enrichment.summary}` : 'No confident catalog match.',
      matchScore: top?.score || 0,
      matchCandidates: candidates,
      webEnrichment: enrichment || undefined,
    });
  }

  const averageConfidence = matchedLines.length > 0
    ? matchedLines.reduce((sum, line) => sum + Number(line.matchScore || 0), 0) / matchedLines.length
    : 0;

  return {
    parsedLines: matchedLines,
    logs,
    warnings: Array.from(new Set(warnings)),
    usedWebEnrichment,
    averageConfidence,
  };
}