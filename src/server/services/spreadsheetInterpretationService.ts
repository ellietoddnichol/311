import { IntakeParseRequest } from '../../shared/types/intake.ts';

export interface SpreadsheetInterpretationSummary {
  lineCount: number;
  headerKeys: string[];
  looksMatrixLike: boolean;
  summary: string;
  compactRows: Array<Record<string, unknown>>;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function summarizeStructuredSpreadsheet(input: IntakeParseRequest): SpreadsheetInterpretationSummary | null {
  const rows = Array.isArray(input.normalizedRows) ? input.normalizedRows : [];
  if (rows.length === 0) return null;

  const headerKeys = Array.from(new Set(
    rows
      .flatMap((row) => Object.keys(row))
      .map(normalizeKey)
      .filter(Boolean)
  ));

  const looksMatrixLike = headerKeys.some((key) => key.includes('room') || key.includes('area'))
    && headerKeys.some((key) => key.includes('qty') || key.includes('quantity'))
    && headerKeys.some((key) => key.includes('item') || key.includes('description'));

  const compactRows = rows.slice(0, 150).map((row) => {
    const compact: Record<string, unknown> = {};
    Object.entries(row).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return;
      compact[key] = value;
    });
    return compact;
  });

  return {
    lineCount: rows.length,
    headerKeys,
    looksMatrixLike,
    summary: looksMatrixLike
      ? `Structured spreadsheet with ${rows.length} normalized rows and matrix-style room/quantity hints.`
      : `Structured spreadsheet with ${rows.length} normalized rows ready for Gemini-assisted interpretation.`,
    compactRows,
  };
}