import * as xlsx from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';
import type { ExtractedSpreadsheetRow, IntakeProjectMetadata, UploadFileType } from '../../../shared/types/intake.ts';
import { extractMetadataFromText, intakeAsText, mergeMetadataHint, normalizeComparableText } from '../metadataExtractorService.ts';
import { analyzeMatrixTakeoffSheet, detectMatrixTakeoffSheet, type MatrixSheetAnalysis } from './workbookShapeDetector.ts';
import { parseMatrixTakeoffSheet } from './matrixTakeoffParser.ts';
import { matchesPreferredTemplate } from '../../../shared/utils/importTemplate.ts';

export interface ExcelParseOutput {
  fileType: Extract<UploadFileType, 'excel' | 'csv'>;
  extractedRows: ExtractedSpreadsheetRow[];
  warnings: string[];
  sourceSummary: {
    fileName: string;
    sheetsProcessed: string[];
  };
  metadata: Partial<IntakeProjectMetadata>;
}

type CanonicalColumn = keyof ExtractedSpreadsheetRow['mappedFields'];

const HEADER_ALIASES: Record<CanonicalColumn, string[]> = {
  roomName: ['room', 'room name', 'area', 'area name', 'area room', 'area / room', 'space', 'zone', 'phase', 'location'],
  itemDescription: [
    'item', 'item name', 'description', 'scope item', 'work description', 'product',
    // Preferred template keeps "Item Name" and "Description" as separate columns; parser merges them below.
  ],
  quantity: ['qty', 'quantity', 'count', 'amount'],
  unit: ['unit', 'uom', 'measure', 'unit of measure'],
  manufacturer: ['manufacturer', 'mfr', 'vendor'],
  model: ['model', 'model number', 'series', 'part number', 'model sku', 'model / sku', 'sku'],
  finish: ['finish', 'color', 'coating', 'finish color', 'finish / color'],
  notes: ['notes', 'remarks', 'comments', 'clarifications', 'exclusions', 'inclusions'],
  cost: ['cost', 'price', 'rate', 'material cost', 'unit cost'],
};

// Extra preferred-template columns that we surface via mappedFields notes/metadata.
const EXTENDED_TEMPLATE_COLUMNS: Array<{ key: string; aliases: string[] }> = [
  { key: 'mounting', aliases: ['mounting', 'install type', 'mounting install type', 'mounting / install type', 'installation'] },
  { key: 'alternate', aliases: ['alternate', 'allowance', 'alternate allowance', 'alternate / allowance', 'bid alternate'] },
  { key: 'adders', aliases: ['adders', 'modifiers', 'adders modifiers', 'adders / modifiers', 'add-ons'] },
  { key: 'laborScope', aliases: ['labor scope', 'labor', 'install scope'] },
  { key: 'materialScope', aliases: ['material scope', 'supply scope', 'material'] },
];

function tokenize(value: string): string[] {
  return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}

function overlapScore(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token)).length;
  if (!shared) return 0;
  return shared / Math.max(leftTokens.length, rightTokens.length);
}

function scoreHeaderRow(row: unknown[]): number {
  const headers = row.map((cell) => intakeAsText(cell)).filter(Boolean);
  if (!headers.length) return 0;

  return headers.reduce((best, header) => {
    const localBest = Object.values(HEADER_ALIASES)
      .flat()
      .reduce((score, alias) => Math.max(score, overlapScore(header, alias)), 0);
    return best + localBest;
  }, 0);
}

function detectHeaderRows(rows: unknown[][]): number[] {
  const headerRows: number[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const score = scoreHeaderRow(row);
    const filled = row.filter((cell) => intakeAsText(cell)).length;
    if (filled >= 2 && score >= 1.6) {
      headerRows.push(index);
    }
  }
  return Array.from(new Set(headerRows));
}

function bestColumnForAlias(headers: string[], aliases: string[], used: Set<number>): number | null {
  let bestIndex: number | null = null;
  let bestScore = 0;
  headers.forEach((header, index) => {
    if (used.has(index)) return;
    const score = aliases.reduce((currentBest, alias) => Math.max(currentBest, overlapScore(header, alias)), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore >= 0.45 ? bestIndex : null;
}

function detectColumnMap(
  headerRow: unknown[],
  preReserved: Set<number> = new Set<number>(),
): Partial<Record<CanonicalColumn, number>> {
  const headers = headerRow.map((cell) => intakeAsText(cell));
  const used = new Set<number>(preReserved);
  const output: Partial<Record<CanonicalColumn, number>> = {};

  (Object.keys(HEADER_ALIASES) as CanonicalColumn[]).forEach((key) => {
    const index = bestColumnForAlias(headers, HEADER_ALIASES[key], used);
    if (index === null) return;
    used.add(index);
    output[key] = index;
  });

  return output;
}

function parseNumericValue(value: unknown): number | null {
  const text = intakeAsText(value).replace(/[$,%(),]/g, '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function propagateMergedValues(sheet: xlsx.WorkSheet, rows: unknown[][]): unknown[][] {
  const output = rows.map((row) => [...row]);
  const merges = sheet['!merges'] || [];
  merges.forEach((merge) => {
    const baseValue = output[merge.s.r]?.[merge.s.c];
    for (let rowIndex = merge.s.r; rowIndex <= merge.e.r; rowIndex += 1) {
      for (let columnIndex = merge.s.c; columnIndex <= merge.e.c; columnIndex += 1) {
        if (!intakeAsText(output[rowIndex]?.[columnIndex])) {
          if (!output[rowIndex]) output[rowIndex] = [];
          output[rowIndex][columnIndex] = baseValue;
        }
      }
    }
  });
  return output;
}

function extractMatrixMetadata(rows: unknown[][], analysis: MatrixSheetAnalysis): Partial<IntakeProjectMetadata> {
  if (!analysis.isMatrix || analysis.itemHeaderRow === null) {
    return { sourceFiles: [], assumptions: [], pricingBasis: '' };
  }

  const firstProductColumn = analysis.itemHeaders[0]?.columnIndex ?? Number.MAX_SAFE_INTEGER;
  const metadataLines: string[] = [];

  for (let rowIndex = 0; rowIndex <= analysis.itemHeaderRow; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const selectedCells = row
      .map((cell, columnIndex) => ({ text: intakeAsText(cell), columnIndex }))
      .filter(({ text }) => Boolean(text))
      .filter(({ text, columnIndex }) => {
        if (/^column\s*\d+$/i.test(text)) return false;
        if (rowIndex < analysis.itemHeaderRow) return true;
        if (columnIndex < firstProductColumn) return true;
        return /^(project|project name|job|job name|client|owner|gc|general contractor|address|location|site|bid date|proposal date|due date|date|estimator|prepared by|package)\s*[:\-]/i.test(text);
      })
      .map(({ text }) => text);

    if (selectedCells.length > 0) metadataLines.push(selectedCells.join(' '));
  }

  return extractMetadataFromText(metadataLines.join('\n'));
}

function detectExtendedColumns(headerRow: unknown[], used: Set<number>): Record<string, number> {
  const headers = headerRow.map((cell) => intakeAsText(cell));
  const output: Record<string, number> = {};
  EXTENDED_TEMPLATE_COLUMNS.forEach(({ key, aliases }) => {
    const index = bestColumnForAlias(headers, aliases, used);
    if (index !== null) {
      used.add(index);
      output[key] = index;
    }
  });
  return output;
}

function detectItemNameColumn(headerRow: unknown[], used: Set<number>): number | null {
  const headers = headerRow.map((cell) => intakeAsText(cell));
  const index = bestColumnForAlias(headers, ['item name'], used);
  if (index !== null) used.add(index);
  return index;
}

function extractSectionRows(input: {
  rows: unknown[][];
  headerIndex: number;
  nextHeaderIndex: number;
  sourceSheet: string;
  sourceSheetHidden: boolean;
}): ExtractedSpreadsheetRow[] {
  const { rows, headerIndex, nextHeaderIndex, sourceSheet, sourceSheetHidden } = input;
  const headerRow = rows[headerIndex] || [];
  const headerTexts = headerRow.map((cell) => intakeAsText(cell));
  const isPreferredTemplate = matchesPreferredTemplate(headerTexts);

  // When the preferred template is detected, pre-bind Item Name so the itemDescription
  // heuristic picks the Description column (not Item Name). That keeps both values and
  // merges them below. Only do this when the template is confidently the preferred one;
  // otherwise legacy sheets that use "Item Name" as the single description column would
  // break.
  const preferredItemNameIndex = isPreferredTemplate
    ? detectItemNameColumn(headerRow, new Set<number>())
    : null;
  const preReserved = new Set<number>();
  if (preferredItemNameIndex !== null) preReserved.add(preferredItemNameIndex);
  const columnMap = detectColumnMap(headerRow, preReserved);
  const usedIndexes = new Set<number>(Object.values(columnMap).filter((value): value is number => value !== undefined));
  if (preferredItemNameIndex !== null) usedIndexes.add(preferredItemNameIndex);
  const extendedColumns = detectExtendedColumns(headerRow, usedIndexes);
  const output: ExtractedSpreadsheetRow[] = [];

  for (let rowIndex = headerIndex + 1; rowIndex < nextHeaderIndex; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const populated = row.some((cell) => intakeAsText(cell));
    if (!populated) continue;

    const rawRow: Record<string, unknown> = {};
    headerRow.forEach((header, index) => {
      const key = intakeAsText(header) || `column_${index + 1}`;
      rawRow[key] = row[index] ?? null;
    });

    const itemName = preferredItemNameIndex !== null ? intakeAsText(row[preferredItemNameIndex]) : '';
    const descriptionCell = columnMap.itemDescription !== undefined ? intakeAsText(row[columnMap.itemDescription]) : '';
    // Merge Item Name + Description when both are present (preferred template).
    const itemDescription = itemName && descriptionCell && itemName.toLowerCase() !== descriptionCell.toLowerCase()
      ? `${itemName} — ${descriptionCell}`
      : (itemName || descriptionCell);
    const quantity = columnMap.quantity !== undefined ? parseNumericValue(row[columnMap.quantity]) : null;

    const extraNotes: string[] = [];
    const readExtended = (key: string): string | null => {
      const index = extendedColumns[key];
      if (index === undefined) return null;
      const value = intakeAsText(row[index]);
      return value || null;
    };
    const mounting = readExtended('mounting');
    const alternate = readExtended('alternate');
    const adders = readExtended('adders');
    const laborScope = readExtended('laborScope');
    const materialScope = readExtended('materialScope');
    if (mounting) extraNotes.push(`Mounting: ${mounting}`);
    if (alternate) extraNotes.push(`Alternate: ${alternate}`);
    if (adders) extraNotes.push(`Adders: ${adders}`);
    if (laborScope) extraNotes.push(`Labor: ${laborScope}`);
    if (materialScope) extraNotes.push(`Material: ${materialScope}`);

    const notesCell = columnMap.notes !== undefined ? intakeAsText(row[columnMap.notes]) : '';
    const mergedNotes = [notesCell, extraNotes.join(' | ')].filter(Boolean).join(' | ') || null;

    const mappedFields: ExtractedSpreadsheetRow['mappedFields'] = {
      roomName: columnMap.roomName !== undefined ? intakeAsText(row[columnMap.roomName]) || undefined : undefined,
      itemDescription: itemDescription || undefined,
      quantity,
      unit: columnMap.unit !== undefined ? intakeAsText(row[columnMap.unit]) || null : null,
      manufacturer: columnMap.manufacturer !== undefined ? intakeAsText(row[columnMap.manufacturer]) || null : null,
      model: columnMap.model !== undefined ? intakeAsText(row[columnMap.model]) || null : null,
      finish: columnMap.finish !== undefined ? intakeAsText(row[columnMap.finish]) || null : null,
      notes: mergedNotes,
      cost: columnMap.cost !== undefined ? parseNumericValue(row[columnMap.cost]) : null,
    };

    const parsingNotes: string[] = [];
    if (!itemDescription) parsingNotes.push('Item description was not mapped from a recognized header.');
    if (quantity === null) parsingNotes.push('Quantity was missing or not numeric.');
    if (!mappedFields.unit) parsingNotes.push('Unit was not mapped from a recognized header.');
    if (isPreferredTemplate) parsingNotes.push('Parsed using preferred import template (high confidence).');

    output.push({
      sourceSheet,
      sourceSheetHidden,
      sourceRowNumber: rowIndex + 1,
      rawRow,
      structureType: 'flat',
      mappedFields,
      parsingNotes,
    });
  }

  return output;
}

function readWorkbook(input: { fileName: string; mimeType: string; dataBase64: string }): { workbook: xlsx.WorkBook; fileType: Extract<UploadFileType, 'excel' | 'csv'> } {
  const fileName = input.fileName.toLowerCase();
  const mimeType = input.mimeType.toLowerCase();

  if (fileName.endsWith('.csv') || mimeType.includes('csv')) {
    const text = Buffer.from(input.dataBase64, 'base64').toString('utf8');
    const rows = parseCsv(text, { relaxColumnCount: true, skipEmptyLines: false }) as unknown[][];
    const worksheet = xlsx.utils.aoa_to_sheet(rows);
    return {
      fileType: 'csv',
      workbook: {
        SheetNames: ['CSV Import'],
        Sheets: { 'CSV Import': worksheet },
        Workbook: { Sheets: [{ name: 'CSV Import', Hidden: 0 }] },
      } as xlsx.WorkBook,
    };
  }

  return {
    fileType: 'excel',
    workbook: xlsx.read(Buffer.from(input.dataBase64, 'base64'), { type: 'buffer', cellFormula: true, cellNF: true, cellText: true }),
  };
}

export function parseExcelUpload(input: { fileName: string; mimeType: string; dataBase64: string }): ExcelParseOutput {
  const { workbook, fileType } = readWorkbook(input);
  const extractedRows: ExtractedSpreadsheetRow[] = [];
  const warnings: string[] = [];
  let metadata: Partial<IntakeProjectMetadata> = { sourceFiles: [], assumptions: [], pricingBasis: '' };

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const rows = propagateMergedValues(sheet, xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null }) as unknown[][]);
    const visibleState = workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden ?? 0;
    const sourceSheetHidden = visibleState !== 0;
    const matrixAnalysis = analyzeMatrixTakeoffSheet({ sheetName, rows });
    const headerRows = detectHeaderRows(rows);

    if (matrixAnalysis.isMatrix && detectMatrixTakeoffSheet({ sheetName, rows })) {
      metadata = mergeMetadataHint(metadata, extractMatrixMetadata(rows, matrixAnalysis));
      const matrixResult = parseMatrixTakeoffSheet({ sheetName, sourceSheetHidden, rows });
      if (matrixResult) {
        extractedRows.push(...matrixResult.extractedRows);
        warnings.push(...matrixResult.warnings);
        return;
      }
    }

    const sheetText = rows
      .slice(0, Math.min(rows.length, 30))
      .map((row) => row.map((cell) => intakeAsText(cell)).filter(Boolean).join(' '))
      .filter(Boolean)
      .join('\n');
    metadata = mergeMetadataHint(metadata, extractMetadataFromText(sheetText));

    if (!headerRows.length) {
      warnings.push(`No confident header row was detected on sheet ${sheetName}.`);
      return;
    }

    headerRows.forEach((headerIndex, index) => {
      const nextHeaderIndex = headerRows[index + 1] ?? rows.length;
      extractedRows.push(...extractSectionRows({ rows, headerIndex, nextHeaderIndex, sourceSheet: sheetName, sourceSheetHidden }));
    });
  });

  if (!extractedRows.length) {
    warnings.push('No structured spreadsheet rows were extracted.');
  }

  return {
    fileType,
    extractedRows,
    warnings,
    sourceSummary: {
      fileName: input.fileName,
      sheetsProcessed: workbook.SheetNames,
    },
    metadata,
  };
}