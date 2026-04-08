import type { CatalogItem } from '../../types.ts';
import type { ModifierRecord } from '../../shared/types/estimator.ts';
import type {
  IntakeAiLineClassification,
  IntakeAiSuggestions,
  IntakeCatalogMatch,
  IntakeEstimateDraft,
  IntakeLineEstimateSuggestion,
  IntakeMatchConfidence,
  IntakeReviewLine,
  IntakeScopeBucket,
} from '../../shared/types/intake.ts';
import {
  catalogMatchScoreToIntake,
  listCatalogMatchScores,
  type CatalogMatchInput,
  type CatalogMatchScore,
} from './intakeCatalogMatching.ts';
import { intakeAsText } from './metadataExtractorService.ts';

const TOP_N = 3;
const MFR_BOOST = 0.04;
const CAT_BOOST = 0.022;

function normRoom(value: unknown): string {
  return intakeAsText(value) || 'General';
}

function tokenKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .join(' ')
    .trim();
}

function extractRoomConsistencySignals(
  lines: IntakeReviewLine[],
  catalogById: Map<string, CatalogItem>
): { manufacturerCounts: Map<string, Map<string, number>>; categoryCounts: Map<string, Map<string, number>> } {
  const manufacturerCounts = new Map<string, Map<string, number>>();
  const categoryCounts = new Map<string, Map<string, number>>();

  for (const line of lines) {
    const room = normRoom(line.roomName);
    const cm = line.catalogMatch;
    if (!cm || cm.confidence !== 'strong') continue;
    const item = catalogById.get(cm.catalogItemId);
    if (!item) continue;

    const mfr = tokenKey(item.manufacturer || '');
    if (mfr) {
      const map = manufacturerCounts.get(room) || new Map();
      map.set(mfr, (map.get(mfr) || 0) + 1);
      manufacturerCounts.set(room, map);
    }

    const cat = tokenKey(item.category || '');
    if (cat) {
      const map2 = categoryCounts.get(room) || new Map();
      map2.set(cat, (map2.get(cat) || 0) + 1);
      categoryCounts.set(room, map2);
    }
  }

  return { manufacturerCounts, categoryCounts };
}

function keysWithMinCount(countMap: Map<string, number>, min: number): Set<string> {
  return new Set([...countMap.entries()].filter(([, c]) => c >= min).map(([k]) => k));
}

function findLineClassification(
  line: IntakeReviewLine,
  lineIndex: number,
  ai?: IntakeAiSuggestions | null
): IntakeAiLineClassification | undefined {
  const list = ai?.lineClassifications;
  if (!list?.length) return undefined;
  const exact = list.find((c) => c.lineIndex === lineIndex);
  if (exact) return exact;
  const d = (line.description || line.itemName || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!d) return undefined;
  let best: IntakeAiLineClassification | undefined;
  let bestLen = 0;
  for (const c of list) {
    const p = c.descriptionPreview.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!p) continue;
    const head = Math.min(24, p.length, d.length);
    if (head < 4) continue;
    if (d.includes(p.slice(0, head)) || p.includes(d.slice(0, head))) {
      if (p.length > bestLen) {
        bestLen = p.length;
        best = c;
      }
    }
  }
  return best;
}

function mapScopeBucket(cls: IntakeAiLineClassification | undefined, line: IntakeReviewLine): IntakeScopeBucket {
  const text = `${line.description} ${line.notes}`.toLowerCase();
  if (line.semanticTags?.some((t) => /excluded|by.?others|ofci|\bnic\b/i.test(String(t).toLowerCase()))) {
    return 'excluded_by_others';
  }
  if (/\b(alt\.?|alternate|deduct|credit)\b/i.test(text)) return 'deduction_alternate';
  if (/\b(exclude|excluded|by others|b\/o|nic|ofci)\b/i.test(text)) return 'excluded_by_others';
  if (/\ballowance\b/i.test(text)) return 'allowance';

  if (cls) {
    const blob = `${cls.documentLineKind} ${cls.pricingRole} ${cls.scopeTarget} ${cls.costDriver}`.toLowerCase();
    if (/\b(excluded|by others|ofci|nic|informational|note only|header)\b/.test(blob) && !/\b(bid|price|qty)\b/.test(blob)) {
      return 'informational_only';
    }
    if (/\b(alternate|deduct|credit)\b/.test(blob)) return 'deduction_alternate';
    if (/\b(exclude|by others)\b/.test(blob)) return 'excluded_by_others';
    if (/\ballowance\b/.test(blob)) return 'allowance';
    if (/\b(modifier|line condition|field condition|finish)\b/.test(blob)) return 'line_condition';
    if (/\b(project|mobil|site[- ]wide|global)\b/.test(blob)) return 'project_condition';
    if (/\b(base|fixture|material|labor|unit)\b/.test(blob)) return 'priced_base_scope';
  }

  if (line.matchStatus !== 'needs_match') return 'priced_base_scope';
  return 'unknown';
}

function matchModifierIds(haystack: string, modifiers: ModifierRecord[]): string[] {
  const t = tokenKey(haystack);
  if (!t) return [];
  return modifiers
    .filter((m) => {
      const n = tokenKey(m.name);
      const k = tokenKey(m.modifierKey || '');
      return (n.length > 2 && t.includes(n)) || (k.length > 2 && t.includes(k));
    })
    .map((m) => m.id);
}

function matchProjectModifierIdsFromHints(hints: { phrase: string }[], modifiers: ModifierRecord[]): string[] {
  const ids = new Set<string>();
  for (const h of hints) {
    for (const id of matchModifierIds(h.phrase, modifiers)) ids.add(id);
  }
  return [...ids];
}

function confidenceFromScore(score: number): IntakeMatchConfidence {
  if (score >= 0.8) return 'strong';
  if (score >= 0.5) return 'possible';
  return 'none';
}

function applyCrossLineBoost(
  ranked: CatalogMatchScore[],
  room: string,
  manufacturerCounts: Map<string, Map<string, number>>,
  categoryCounts: Map<string, Map<string, number>>
): CatalogMatchScore[] {
  const mfrConsistent = keysWithMinCount(manufacturerCounts.get(room) || new Map(), 2);
  const catConsistent = keysWithMinCount(categoryCounts.get(room) || new Map(), 2);

  return ranked.map((s) => {
    let delta = 0;
    const signals: string[] = [];
    const mfrK = tokenKey(s.item.manufacturer || '');
    if (mfrK && mfrConsistent.has(mfrK)) {
      delta += MFR_BOOST;
      signals.push('room_manufacturer_consistency');
    }
    const catK = tokenKey(s.item.category || '');
    if (catK && catConsistent.has(catK)) {
      delta += CAT_BOOST;
      signals.push('room_category_consistency');
    }
    if (delta <= 0) return s;
    const newScore = Math.min(1, s.score + delta);
    const confidence = confidenceFromScore(newScore);
    const reason = `${s.reason}; Cross-line consistency (+${delta.toFixed(3)})`;
    return { ...s, score: newScore, confidence, reason };
  });
}

export function buildIntakeEstimateDraft(params: {
  reviewLines: IntakeReviewLine[];
  catalog: CatalogItem[];
  modifiers: ModifierRecord[];
  aiSuggestions?: IntakeAiSuggestions | null;
}): IntakeEstimateDraft | undefined {
  const { reviewLines, catalog, modifiers, aiSuggestions } = params;
  if (!catalog.length) return undefined;

  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const { manufacturerCounts, categoryCounts } = extractRoomConsistencySignals(reviewLines, catalogById);
  const projectModIds = matchProjectModifierIdsFromHints(aiSuggestions?.suggestedProjectModifierHints ?? [], modifiers);

  const lineSuggestions: IntakeLineEstimateSuggestion[] = reviewLines.map((line, lineIndex) => {
    const room = normRoom(line.roomName);
    const input: CatalogMatchInput = {
      itemCode: line.itemCode,
      itemName: line.itemName,
      description: line.description,
      category: line.category,
      notes: line.notes,
      unit: line.unit,
    };

    const rankedBase = listCatalogMatchScores(input, catalog, { minScore: 0.28 });
    const boosted = applyCrossLineBoost(rankedBase, room, manufacturerCounts, categoryCounts).sort((a, b) => b.score - a.score);
    const top: IntakeCatalogMatch[] = boosted.slice(0, TOP_N).map(catalogMatchScoreToIntake);

    const cls = findLineClassification(line, lineIndex, aiSuggestions);
    const scopeBucket = mapScopeBucket(cls, line);

    const lineText = `${line.description} ${line.notes} ${line.itemName}`;
    const lineModIds = matchModifierIds(lineText, modifiers);

    const suggestedCatalogItemId =
      line.catalogMatch?.catalogItemId ?? line.suggestedMatch?.catalogItemId ?? top[0]?.catalogItemId ?? null;

    let pricingPreview: IntakeLineEstimateSuggestion['pricingPreview'] = null;
    if (scopeBucket === 'priced_base_scope' && suggestedCatalogItemId) {
      const item = catalogById.get(suggestedCatalogItemId);
      if (item) {
        pricingPreview = {
          materialEach: item.baseMaterialCost,
          laborMinutesEach: item.baseLaborMinutes,
          qty: line.quantity,
        };
      }
    }

    const marketingNotes: string[] = [];
    if (scopeBucket === 'excluded_by_others') marketingNotes.push('Excluded / by-others bucket — confirm before pricing.');
    if (scopeBucket === 'deduction_alternate') marketingNotes.push('Alternate or deduction — confirm bid basis.');
    if (scopeBucket === 'allowance') marketingNotes.push('Allowance line — verify against contract allowance.');
    if (scopeBucket === 'informational_only') marketingNotes.push('Informational / non-priced — verify scope.');

    const matcherSignals: string[] = [];
    if (boosted[0]?.reason.includes('Cross-line consistency')) {
      matcherSignals.push('cross_line_top_candidate');
    }

    return {
      reviewLineFingerprint: line.reviewLineFingerprint,
      lineId: line.lineId,
      scopeBucket,
      applicationStatus: 'suggested',
      topCatalogCandidates: top,
      suggestedCatalogItemId,
      suggestedLineModifierIds: lineModIds,
      suggestedProjectModifierIds: projectModIds,
      matcherSignals,
      marketingNotes,
      pricingPreview,
    };
  });

  return {
    version: 1,
    readonly: true,
    generatedAt: new Date().toISOString(),
    lineSuggestions,
    projectSuggestion: {
      applicationStatus: 'suggested',
      suggestedProjectModifierIds: projectModIds,
      marketingNotes: [],
    },
  };
}
