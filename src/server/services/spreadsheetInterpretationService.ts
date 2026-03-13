import * as XLSX from 'xlsx';
import type { IntakeProject, IntakeParsedLine, IntakeRoom } from '../../shared/types/intake.ts';

export interface SpreadsheetParseInput {
  dataBase64: string;
  mimeType: string;
  fileName: string;
}

export interface SpreadsheetParseOutput {
  project: Partial<IntakeProject>;
  rooms: IntakeRoom[];
  parsedLines: Omit<IntakeParsedLine, 'matchStatus' | 'matchedCatalogItemId' | 'matchedSku' | 'matchedDescription' | 'confidence' | 'matchExplanation' | 'materialCost' | 'laborMinutes'>[];
  normalizedRows: Array<Record<string, unknown>>;
  rawHeaders: string[];
  isMatrix: boolean;
  sheetsDetected: string[];
  warnings: string[];
  columnMapFound: boolean;
  matrixDetected: boolean;
  parseStrategy: 'spreadsheet-rows' | 'spreadsheet-matrix' | 'csv';
}

type ColumnMap = {
  project: number | null;
  projectNumber: number | null;
  client: number | null;
  address: number | null;
  bidDate: number | null;
  category: number | null;
  itemCode: number | null;
  item: number | null;
  description: number | null;
  qty: number | null;
  unit: number | null;
  notes: number | null;
  room: number | null;
};

function normalizeHeader(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findCol(headers: string[], aliases: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    if (!headers[i]) continue;
    if (aliases.some((a) => headers[i] === a || headers[i].includes(a))) return i;
  }
  return null;
}

function detectColumns(headers: string[]): ColumnMap {
  const n = headers.map((h) => normalizeHeader(h));
  return {
    project: findCol(n, ['project name', 'project', 'job name', 'job']),
    projectNumber: findCol(n, ['project number', 'job number', 'bid package', 'package no', 'pkg']),
    client: findCol(n, ['client', 'owner', 'gc', 'general contractor']),
    address: findCol(n, ['address', 'location', 'site address', 'site']),
    bidDate: findCol(n, ['bid date', 'proposal date', 'due date', 'date due']),
    category: findCol(n, ['scope category', 'category', 'scope', 'division', 'csi']),
    itemCode: findCol(n, ['item code', 'sku', 'code', 'search key', 'part no', 'part number']),
    item: findCol(n, ['item name', 'item', 'scope item', 'product']),
    description: findCol(n, ['description', 'desc', 'work description', 'scope description', 'spec']),
    qty: findCol(n, ['quantity', 'qty', 'count', 'amount']),
    unit: findCol(n, ['unit', 'uom', 'unit of measure']),
    notes: findCol(n, ['notes', 'remarks', 'comment', 'comments', 'special conditions']),
    room: findCol(n, ['room', 'area', 'zone', 'floor', 'space', 'location']),
  };
}

function countMapped(m: ColumnMap): number {
  return Object.values(m).filter((v) => v !== null).length;
}

function findHeaderRow(rows: unknown[][]): number {
  const search = rows.slice(0, Math.min(rows.length, 15));
  let best = 0;
  let bestScore = -1;
  search.forEach((row, i) => {
    const nonEmpty = row.filter(Boolean).length;
    if (nonEmpty === 0) return;
    const headers = row.map((c) => normalizeHeader(String(c || '')));
    const map = detectColumns(headers);
    const keywordHits = headers.filter((h) => /project|client|address|date|category|item|desc|qty|unit|room|scope|sku/.test(h)).length;
    const score = countMapped(map) * 10 + keywordHits * 3 + Math.min(nonEmpty, 8);
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

function isMatrixLayout(rows: unknown[][]): boolean {
  if (rows.length < 3) return false;
  const headerRow = rows[0];
  const nonEmptyHeaderCells = headerRow.slice(1).filter(Boolean);
  if (nonEmptyHeaderCells.length < 3) return false;
  // Check if left column has room-like values and cells are numeric
  let numericCellCount = 0;
  let totalCells = 0;
  for (let r = 1; r < Math.min(rows.length, 10); r++) {
    for (let c = 1; c < rows[r].length; c++) {
      const cell = rows[r][c];
      totalCells++;
      if (cell !== null && cell !== undefined && cell !== '' && !isNaN(Number(cell))) numericCellCount++;
    }
  }
  return totalCells > 0 && numericCellCount / totalCells > 0.4;
}

function parseValue(value: unknown): string {
  return String(value ?? '').trim();
}

function parseNum(value: unknown, fallback = 1): number {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function makeLineId(): string { return `line-${crypto.randomUUID()}`; }
function makeRoomId(): string { return `room-${crypto.randomUUID()}`; }

function parseRowBased(
  rows: unknown[][],
  headerRowIndex: number,
  sheetName: string
): { project: Partial<IntakeProject>; lines: SpreadsheetParseOutput['parsedLines']; normalizedRows: Array<Record<string, unknown>>; rooms: string[] } {
  const headers = rows[headerRowIndex].map((c) => String(c || ''));
  const colMap = detectColumns(headers);
  const dataRows = rows.slice(headerRowIndex + 1).filter((row) => row.some(Boolean));

  const projectValues: Record<string, string[]> = { projectName: [], projectNumber: [], client: [], address: [], bidDate: [] };
  const lines: SpreadsheetParseOutput['parsedLines'] = [];
  const normalizedRows: Array<Record<string, unknown>> = [];
  const roomSet = new Set<string>();

  dataRows.forEach((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
    normalizedRows.push(obj);

    const get = (idx: number | null): string => idx !== null ? parseValue(row[idx]) : '';
    const getNum = (idx: number | null): number => idx !== null ? parseNum(row[idx]) : 1;

    if (colMap.project !== null && get(colMap.project)) projectValues.projectName.push(get(colMap.project));
    if (colMap.projectNumber !== null && get(colMap.projectNumber)) projectValues.projectNumber.push(get(colMap.projectNumber));
    if (colMap.client !== null && get(colMap.client)) projectValues.client.push(get(colMap.client));
    if (colMap.address !== null && get(colMap.address)) projectValues.address.push(get(colMap.address));
    if (colMap.bidDate !== null && get(colMap.bidDate)) projectValues.bidDate.push(get(colMap.bidDate));

    const description = get(colMap.description) || get(colMap.item) || '';
    if (!description) return;

    const roomName = get(colMap.room);
    if (roomName) roomSet.add(roomName);

    lines.push({
      id: makeLineId(),
      roomArea: roomName,
      category: get(colMap.category),
      itemCode: get(colMap.itemCode),
      itemName: get(colMap.item) || description.split(' ').slice(0, 5).join(' '),
      description,
      quantity: getNum(colMap.qty),
      unit: get(colMap.unit) || 'EA',
      notes: get(colMap.notes),
      sourceReference: `Sheet: ${sheetName}`,
    });
  });

  const mostCommon = (arr: string[]): string => {
    const counts = new Map<string, number>();
    arr.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    let best = ''; let bestN = 0;
    counts.forEach((n, v) => { if (n > bestN) { bestN = n; best = v; } });
    return best;
  };

  const project: Partial<IntakeProject> = {
    projectName: mostCommon(projectValues.projectName),
    projectNumber: mostCommon(projectValues.projectNumber),
    client: mostCommon(projectValues.client),
    address: mostCommon(projectValues.address),
    bidDate: mostCommon(projectValues.bidDate),
  };

  return { project, lines, normalizedRows, rooms: Array.from(roomSet) };
}

function parseMatrixLayout(rows: unknown[][], sheetName: string): SpreadsheetParseOutput['parsedLines'] {
  const itemHeaders = rows[0].slice(1).map((h) => String(h || ''));
  const lines: SpreadsheetParseOutput['parsedLines'] = [];

  for (let r = 1; r < rows.length; r++) {
    const roomName = String(rows[r][0] || '').trim();
    if (!roomName) continue;
    for (let c = 1; c < rows[r].length; c++) {
      const qty = Number(rows[r][c]);
      if (!qty || qty <= 0 || !Number.isFinite(qty)) continue;
      const itemName = itemHeaders[c - 1];
      if (!itemName) continue;
      lines.push({
        id: makeLineId(),
        roomArea: roomName,
        category: '',
        itemCode: '',
        itemName,
        description: itemName,
        quantity: qty,
        unit: 'EA',
        notes: '',
        sourceReference: `Sheet: ${sheetName}, Row: ${r + 1}`,
      });
    }
  }
  return lines;
}

export function parseSpreadsheet(input: SpreadsheetParseInput): SpreadsheetParseOutput {
  const warnings: string[] = [];
  const buffer = Buffer.from(input.dataBase64, 'base64');

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (err: any) {
    warnings.push(`Failed to parse spreadsheet: ${err.message}`);
    return {
      project: {},
      rooms: [],
      parsedLines: [],
      normalizedRows: [],
      rawHeaders: [],
      isMatrix: false,
      sheetsDetected: [],
      warnings,
      columnMapFound: false,
      matrixDetected: false,
      parseStrategy: 'spreadsheet-rows',
    };
  }

  const sheetsDetected = workbook.SheetNames;
  const allLines: SpreadsheetParseOutput['parsedLines'] = [];
  const allNormalizedRows: Array<Record<string, unknown>> = [];
  const allRooms = new Set<string>();
  let mergedProject: Partial<IntakeProject> = {};
  let columnMapFound = false;
  let matrixDetected = false;
  let rawHeaders: string[] = [];
  let parseStrategy: SpreadsheetParseOutput['parseStrategy'] = 'spreadsheet-rows';

  for (const sheetName of sheetsDetected) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    if (rows.length === 0) continue;

    const headerRowIdx = findHeaderRow(rows);
    const headers = rows[headerRowIdx].map((c) => String(c || ''));
    rawHeaders = rawHeaders.length === 0 ? headers : rawHeaders;
    const colMap = detectColumns(headers);
    const mapped = countMapped(colMap);

    if (mapped >= 3) {
      columnMapFound = true;
      const { project, lines, normalizedRows, rooms } = parseRowBased(rows, headerRowIdx, sheetName);
      allLines.push(...lines);
      allNormalizedRows.push(...normalizedRows);
      rooms.forEach((r) => allRooms.add(r));
      if (!mergedProject.projectName && project.projectName) mergedProject = { ...mergedProject, ...project };
      parseStrategy = 'spreadsheet-rows';
    } else if (isMatrixLayout(rows)) {
      matrixDetected = true;
      const lines = parseMatrixLayout(rows, sheetName);
      allLines.push(...lines);
      lines.forEach((l) => { if (l.roomArea) allRooms.add(l.roomArea); });
      parseStrategy = 'spreadsheet-matrix';
    } else {
      warnings.push(`Sheet "${sheetName}": could not detect a usable structure; will be sent to Gemini for interpretation.`);
      const fallbackRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Array<Record<string, unknown>>;
      allNormalizedRows.push(...fallbackRows.slice(0, 200));
    }
  }

  const rooms: IntakeRoom[] = Array.from(allRooms).map((name) => ({ id: makeRoomId(), name, sourceReference: 'spreadsheet' }));

  return {
    project: mergedProject,
    rooms,
    parsedLines: allLines,
    normalizedRows: allNormalizedRows,
    rawHeaders,
    isMatrix: matrixDetected,
    sheetsDetected,
    warnings,
    columnMapFound,
    matrixDetected,
    parseStrategy,
  };
}
