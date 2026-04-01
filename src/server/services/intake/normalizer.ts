/**
 * PDF intake path (hybrid router): `parsePdfUpload` → text chunks (~2.2k chars, split by page) → this module.
 *
 * - **Deterministic (lenient):** every non-noise line becomes a row unless treated as a room/header (Word PDFs → huge counts).
 * - **Gemini:** runs on the **first 12 chunks only**; often emits one row per short phrase (~30/chunk → ~360 fake “items”).
 * - **Guard:** compare LLM rows to deterministic rows on that **same 12-chunk window**, and detect **high lines/chunk**.
 *   If LLM looks inflated, we use **strict** deterministic parsing on the **full document** (qty / numbered / unit / long phrase / modifiers).
 */
import type { ExtractedSpreadsheetRow, IntakeProjectMetadata, NormalizedIntakeItem } from '../../../shared/types/intake.ts';
import {
  looksLikeIntakePricingSummaryOrDisclaimerLine,
  looksLikePdfExtractionNoiseLine,
  looksLikePdfProposalBoilerplateLine,
} from '../../../shared/utils/intakeTextGuards.ts';
import { extractDocumentWithGemini } from '../geminiExtractionService.ts';
import { intakeAsText, normalizeComparableText } from '../metadataExtractorService.ts';
import { inferCategoryFromText, normalizeExtractedCategory } from '../rowClassifierService.ts';
import type { PdfChunk } from './pdfParser.ts';

const PDF_LLM_CHUNK_LIMIT = 12;

/** After noise/header handling: keep only lines that plausibly belong on a schedule (drops sentence-per-line Word garbage). */
function pdfDeterministicLineQualifiesForScopeRow(
  rawLine: string,
  quantity: number | null,
  description: string,
  inferredItemType: string | null
): boolean {
  if (quantity != null && quantity > 0) return true;
  if (inferredItemType === 'modifier' && description.replace(/\s+/g, ' ').trim().length >= 14) return true;
  const t = rawLine.trim();
  if (/^\(?\d{1,4}[\.\)]\s+\S/.test(t)) return true;
  // Require a real word or common 2-letter unit after qty — avoids "6 lt qa f" PDF operators.
  if (/\b\d{1,6}\s+[xX-]?\s*(?:[A-Za-z]{3,}\b|[A-Z]{2}\b)/.test(t)) return true;
  if (/\b(EA|SF|LF|SY|CY|LS|BOX|SET|PR|GAL|QT|SHT|ROLL|PKG)\b/i.test(t)) return true;
  const desc = description.replace(/\s+/g, ' ').trim();
  return desc.length >= 36;
}

function parseQuantityPrefix(text: string): { quantity: number | null; description: string } {
  const matched = text.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*[xX-]?\s+(.*)$/);
  if (!matched) return { quantity: null, description: text.trim() };
  return {
    quantity: Number(matched[1]) || null,
    description: intakeAsText(matched[2]),
  };
}

function detectItemType(text: string): string | null {
  const normalized = normalizeComparableText(text);
  if (!normalized) return null;
  if (/(finish add|powder coat|add .* finish|security screws|add on|adder|upgrade)/.test(normalized)) return 'modifier';
  if (/(bundle|package|set of accessories|accessory package)/.test(normalized)) return 'bundle';
  return 'item';
}

function detectAlternate(text: string): boolean {
  return /(alternate|alt\.?|option|deduct alternate|add alternate)/i.test(text);
}

function detectExclusion(text: string): boolean {
  return /(exclude|excluded|not included|exclusion)/i.test(text);
}

function extractLabeledValue(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (matched?.[1]) return intakeAsText(matched[1]) || null;
  }
  return null;
}

function extractManufacturerModelFinish(text: string): Pick<NormalizedIntakeItem, 'manufacturer' | 'model' | 'finish'> {
  return {
    manufacturer: extractLabeledValue(text, [/manufacturer\s*[:\-]\s*([^,;]+)/i, /mfr\s*[:\-]\s*([^,;]+)/i, /brand\s*[:\-]\s*([^,;]+)/i]),
    model: extractLabeledValue(text, [/model\s*[:\-]\s*([^,;]+)/i, /series\s*[:\-]\s*([^,;]+)/i]),
    finish: extractLabeledValue(text, [/finish\s*[:\-]\s*([^,;]+)/i, /color\s*[:\-]\s*([^,;]+)/i, /(powder coat[^,;]*)/i]),
  };
}

function detectBundleCandidates(text: string, category: string | null): string[] {
  const normalized = normalizeComparableText(text);
  const output: string[] = [];
  if (/(restroom|toilet accessories|soap dispenser|paper towel|grab bar|mirror)/.test(normalized)) output.push('restroom-accessories');
  if ((category || '').toLowerCase().includes('sign')) output.push('signage-standard');
  if ((category || '').toLowerCase().includes('locker')) output.push('locker-room-starter');
  return output;
}

function clampConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

export function normalizeSpreadsheetRows(input: {
  fileType: 'excel' | 'csv';
  fileName: string;
  rows: ExtractedSpreadsheetRow[];
  metadata: Partial<IntakeProjectMetadata>;
}): NormalizedIntakeItem[] {
  return input.rows.map((row) => {
    const text = row.mappedFields.itemDescription || Object.values(row.rawRow).map((value) => intakeAsText(value)).filter(Boolean).join(' ');
    const labeled = extractManufacturerModelFinish(text);
    const category = normalizeExtractedCategory('', text) || inferCategoryFromText(text) || null;
    const itemType = detectItemType(`${text} ${row.mappedFields.notes || ''}`);
    const alternate = detectAlternate(`${text} ${row.mappedFields.notes || ''}`);
    const exclusion = detectExclusion(`${text} ${row.mappedFields.notes || ''}`);
    const confidence = 0.56
      + (row.mappedFields.itemDescription ? 0.12 : 0)
      + (row.mappedFields.quantity !== null && row.mappedFields.quantity !== undefined ? 0.08 : 0)
      + (row.mappedFields.unit ? 0.06 : 0)
      + (category ? 0.08 : 0)
      - (row.parsingNotes.length * 0.05);

    return {
      sourceType: input.fileType,
      sourceRef: {
        fileName: input.fileName,
        sheetName: row.sourceSheet,
        rowNumber: row.sourceRowNumber,
        sourceColumn: row.sourceColumn,
      },
      itemType,
      category,
      roomName: row.mappedFields.roomName || null,
      description: text || 'Unresolved spreadsheet line',
      quantity: row.mappedFields.quantity ?? null,
      unit: row.mappedFields.unit || null,
      manufacturer: row.mappedFields.manufacturer || labeled.manufacturer,
      model: row.mappedFields.model || labeled.model,
      finish: row.mappedFields.finish || labeled.finish,
      modifiers: itemType === 'modifier' ? [text] : [],
      bundleCandidates: detectBundleCandidates(text, category),
      notes: [...row.parsingNotes, ...(row.mappedFields.notes ? [row.mappedFields.notes] : [])],
      alternate,
      exclusion,
      confidence: clampConfidence(confidence),
      rawHeader: row.rawHeader || row.mappedFields.itemDescription || null,
      normalizedSearchText: row.normalizedSearchText || null,
      parsedTokens: row.parsedTokens || [],
      structureType: row.structureType,
      catalogMatchCandidates: row.catalogMatchCandidates,
      reviewRequired: false,
    };
  });
}

export function normalizePdfLinesDeterministically(
  input: { fileName: string; chunks: PdfChunk[] },
  options?: { scopeRowFilter?: 'lenient' | 'strict' }
): NormalizedIntakeItem[] {
  const items: NormalizedIntakeItem[] = [];
  /** Carry room headers across pages/chunks so PDF takeoffs are not all "un-roomed" per chunk. */
  let currentRoom: string | null = null;
  const strict = options?.scopeRowFilter === 'strict';

  input.chunks.forEach((chunk) => {
    chunk.text.split(/\r?\n/).forEach((rawLine) => {
      const line = intakeAsText(rawLine);
      if (!line) return;
      if (looksLikePdfExtractionNoiseLine(line)) return;
      if (looksLikePdfProposalBoilerplateLine(line)) return;
      if (looksLikeIntakePricingSummaryOrDisclaimerLine(line)) return;
      if (/^(project|client|owner|gc|general contractor|address|site|bid date|proposal date|estimator|prepared by)\b/i.test(line)) return;

      const inferredItemType = detectItemType(line);

      if (
        /^(room|area|phase)\b/i.test(line) ||
        (
          /^[A-Z][A-Za-z0-9\-/ ]+$/.test(line) &&
          line.length <= 48 &&
          !/\d+\s+[xX-]?\s+/.test(line) &&
          inferredItemType !== 'modifier' &&
          inferredItemType !== 'bundle'
        )
      ) {
        currentRoom = line.replace(/^(room|area|phase)\s*[:\-]?\s*/i, '').trim() || line.trim();
        return;
      }

      const { quantity, description } = parseQuantityPrefix(line);
      if (!description) return;
      if (strict && !pdfDeterministicLineQualifiesForScopeRow(line, quantity, description, inferredItemType)) {
        return;
      }
      const labeled = extractManufacturerModelFinish(description);
      const category = normalizeExtractedCategory('', description) || inferCategoryFromText(description) || null;
      const itemType = detectItemType(description);
      items.push({
        sourceType: 'pdf',
        sourceRef: {
          fileName: input.fileName,
          pageNumber: chunk.pageNumber,
          chunkId: chunk.chunkId,
        },
        itemType,
        category,
        roomName: currentRoom,
        description,
        quantity,
        unit: null,
        manufacturer: labeled.manufacturer,
        model: labeled.model,
        finish: labeled.finish,
        modifiers: itemType === 'modifier' ? [description] : [],
        bundleCandidates: detectBundleCandidates(description, category),
        notes: [`Derived from PDF chunk ${chunk.chunkId}.`],
        alternate: detectAlternate(description),
        exclusion: detectExclusion(description),
        confidence: clampConfidence(0.42 + (category ? 0.08 : 0) + (quantity ? 0.06 : 0)),
      });
    });
  });

  return items;
}

export async function normalizePdfChunks(input: {
  fileName: string;
  mimeType: string;
  chunks: PdfChunk[];
}): Promise<NormalizedIntakeItem[]> {
  const deterministicItems = normalizePdfLinesDeterministically(input);
  const llmChunks = input.chunks.slice(0, PDF_LLM_CHUNK_LIMIT);
  const detWindowItems = normalizePdfLinesDeterministically({ fileName: input.fileName, chunks: llmChunks });
  const llmEnabled = String(process.env.UPLOAD_LLM_NORMALIZATION || 'true').toLowerCase() !== 'false';
  if (!llmEnabled || input.chunks.length === 0) {
    return deterministicItems;
  }

  const llmItems: NormalizedIntakeItem[] = [];
  for (const chunk of llmChunks) {
    try {
      const result = await extractDocumentWithGemini({
        fileName: `${input.fileName}#${chunk.chunkId}`,
        mimeType: input.mimeType,
        sourceType: 'document',
        extractedText: chunk.text,
      });

      result.parsedLines.forEach((line) => {
        const text = intakeAsText(line.description || line.itemName);
        if (!text || looksLikePdfExtractionNoiseLine(text) || looksLikePdfProposalBoilerplateLine(text)) return;
        const labeled = extractManufacturerModelFinish(`${line.itemName} ${line.description} ${line.notes}`);
        const category = normalizeExtractedCategory(line.category || '', `${line.itemName} ${line.description}`) || inferCategoryFromText(text) || null;
        const itemType = detectItemType(`${text} ${line.notes || ''}`);
        llmItems.push({
          sourceType: 'pdf',
          sourceRef: {
            fileName: input.fileName,
            pageNumber: chunk.pageNumber,
            chunkId: chunk.chunkId,
          },
          itemType,
          category,
          roomName: line.roomArea || null,
          description: text,
          quantity: Number.isFinite(line.quantity) ? Number(line.quantity) : null,
          unit: intakeAsText(line.unit) || null,
          manufacturer: labeled.manufacturer,
          model: labeled.model,
          finish: labeled.finish,
          modifiers: itemType === 'modifier' ? [text] : [],
          bundleCandidates: detectBundleCandidates(text, category),
          notes: [line.notes || `Normalized from PDF chunk ${chunk.chunkId}.`].filter(Boolean),
          alternate: detectAlternate(`${text} ${line.notes || ''}`),
          exclusion: detectExclusion(`${text} ${line.notes || ''}`),
          confidence: clampConfidence(0.62 + (category ? 0.08 : 0) + (line.roomArea ? 0.05 : 0)),
        });
      });
    } catch (_error) {
      // Keep deterministic fallback items when LLM normalization is unavailable.
    }
  }

  if (!llmItems.length) {
    return deterministicItems;
  }

  const llmCount = llmItems.length;
  const windowCount = detWindowItems.length;
  const avgLlmPerChunk = llmCount / Math.max(1, llmChunks.length);
  // Word-export PDFs: Gemini returns ~20–40 rows per chunk; real takeoffs are much sparser on the same text.
  const inflatedLlm = avgLlmPerChunk > 16 && llmCount >= 56;
  const llmMuchRicherThanSameWindow =
    windowCount >= 3 && llmCount > Math.max(72, windowCount * 2);

  if (inflatedLlm || llmMuchRicherThanSameWindow) {
    const strictItems = normalizePdfLinesDeterministically(input, { scopeRowFilter: 'strict' });
    if (strictItems.length > 0) {
      return strictItems;
    }
    return deterministicItems;
  }

  return llmItems;
}