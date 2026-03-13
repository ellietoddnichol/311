import type { IntakeDiagnostics, IntakeParseStrategy } from '../../shared/types/intake.ts';

export interface DiagnosticsBuilder {
  setStrategy(strategy: IntakeParseStrategy): void;
  setModel(model: string): void;
  addWarning(warning: string): void;
  setEnrichmentUsed(used: boolean): void;
  setSheetsDetected(sheets: string[]): void;
  setColumnMapFound(found: boolean): void;
  setMatrixDetected(detected: boolean): void;
  setLinesExtracted(count: number): void;
  setLinesMatched(count: number): void;
  setLinesNeedMatch(count: number): void;
  build(): IntakeDiagnostics;
}

export function createDiagnosticsBuilder(): DiagnosticsBuilder {
  let strategy: IntakeParseStrategy = 'gemini-document';
  let model = '';
  const warnings: string[] = [];
  let enrichmentUsed = false;
  let sheetsDetected: string[] = [];
  let columnMapFound = false;
  let matrixDetected = false;
  let linesExtracted = 0;
  let linesMatched = 0;
  let linesNeedMatch = 0;

  return {
    setStrategy(s) { strategy = s; },
    setModel(m) { model = m; },
    addWarning(w) { if (w && !warnings.includes(w)) warnings.push(w); },
    setEnrichmentUsed(u) { enrichmentUsed = u; },
    setSheetsDetected(s) { sheetsDetected = s; },
    setColumnMapFound(f) { columnMapFound = f; },
    setMatrixDetected(d) { matrixDetected = d; },
    setLinesExtracted(c) { linesExtracted = c; },
    setLinesMatched(c) { linesMatched = c; },
    setLinesNeedMatch(c) { linesNeedMatch = c; },
    build(): IntakeDiagnostics {
      const matchRate = linesExtracted > 0 ? Math.round((linesMatched / linesExtracted) * 100) : 0;
      return {
        parseStrategy: strategy,
        modelUsed: model,
        warnings,
        enrichmentUsed,
        confidenceSummary: `${linesMatched} of ${linesExtracted} lines matched (${matchRate}% match rate)`,
        sheetsDetected,
        columnMapFound,
        matrixDetected,
        linesExtracted,
        linesMatched,
        linesNeedMatch,
      };
    },
  };
}
