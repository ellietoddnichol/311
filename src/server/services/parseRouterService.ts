import type { IntakeInput, IntakeResult, IntakeParsedLine, IntakeAssumptions, IntakeParseStrategy } from '../../shared/types/intake.ts';
import { parseWithGemini } from './geminiParsingService.ts';
import { parseSpreadsheet } from './spreadsheetInterpretationService.ts';
import { matchLinesToCatalog } from './catalogMatchService.ts';
import { createDiagnosticsBuilder } from './intakeDiagnosticsService.ts';
import type { IntakeProject, IntakeRoom } from '../../shared/types/intake.ts';

function classifyFile(fileName: string, mimeType: string): IntakeParseStrategy {
  const name = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();

  if (mime.startsWith('image/')) return 'gemini-image';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'gemini-pdf';
  if (
    mime.includes('spreadsheetml') ||
    mime.includes('excel') ||
    mime.includes('ms-excel') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls')
  ) return 'spreadsheet-rows';
  if (mime.includes('csv') || name.endsWith('.csv')) return 'csv';
  if (
    mime.includes('msword') ||
    mime.includes('wordprocessingml') ||
    name.endsWith('.doc') ||
    name.endsWith('.docx')
  ) return 'gemini-document';

  return 'text-paste';
}

function buildDefaultAssumptions(): IntakeAssumptions {
  return {
    deliveryIncluded: null,
    tax: null,
    union: null,
    prevailingWage: null,
    laborBasis: 'standard',
    projectConditions: [],
    specialNotes: '',
  };
}

export async function runIntakePipeline(input: IntakeInput): Promise<IntakeResult> {
  const diag = createDiagnosticsBuilder();
  const strategy = classifyFile(input.fileName, input.mimeType);
  diag.setStrategy(strategy);

  const catalog = input.catalogItems || [];
  const useWebEnrichment = Boolean(input.useWebEnrichment && process.env.ENABLE_WEB_ENRICHMENT === 'true');
  const debugMode = process.env.PARSER_DEBUG_MODE === 'true';

  if (debugMode) {
    console.log(`[ParseRouter] Strategy: ${strategy}, File: ${input.fileName}`);
  }

  // --- STEP 1: Parse / Extract ---
  type ParsedLineBase = Omit<IntakeParsedLine, 'matchStatus' | 'matchedCatalogItemId' | 'matchedSku' | 'matchedDescription' | 'confidence' | 'matchExplanation' | 'materialCost' | 'laborMinutes'>;
  let parsedLines: ParsedLineBase[] = [];
  let projectFromParse: Partial<IntakeProject> = {};
  let roomsFromParse: IntakeRoom[] = [];
  let modelUsed = '';
  let extractionWarnings: string[] = [];

  if ((strategy === 'spreadsheet-rows' || strategy === 'spreadsheet-matrix' || strategy === 'csv') && input.dataBase64) {
    const spreadsheetResult = parseSpreadsheet({
      dataBase64: input.dataBase64,
      mimeType: input.mimeType,
      fileName: input.fileName,
    });

    diag.setColumnMapFound(spreadsheetResult.columnMapFound);
    diag.setMatrixDetected(spreadsheetResult.matrixDetected);
    diag.setSheetsDetected(spreadsheetResult.sheetsDetected);
    spreadsheetResult.warnings.forEach((w) => diag.addWarning(w));

    // Use local parsed lines as base
    parsedLines = spreadsheetResult.parsedLines;
    roomsFromParse = spreadsheetResult.rooms;
    projectFromParse = spreadsheetResult.project;

    // If local parse was incomplete or we have unstructured sheets, also use Gemini for enrichment
    const needsGemini = !spreadsheetResult.columnMapFound || spreadsheetResult.warnings.length > 0 || parsedLines.length === 0;
    if (needsGemini) {
      diag.setStrategy('hybrid');
      try {
        const geminiResult = await parseWithGemini({
          fileName: input.fileName,
          mimeType: input.mimeType,
          normalizedRows: spreadsheetResult.normalizedRows,
          parseStrategy: strategy,
          debugMode,
        });
        modelUsed = geminiResult.modelUsed;
        // Merge: prefer local lines if we have them, else use Gemini lines
        if (parsedLines.length === 0) {
          parsedLines = geminiResult.parsedLines;
          roomsFromParse = geminiResult.rooms;
        }
        // Merge project metadata: prefer Gemini if local is empty
        if (!projectFromParse.projectName && geminiResult.project.projectName) {
          projectFromParse = { ...projectFromParse, ...geminiResult.project };
        }
        geminiResult.warnings.forEach((w) => diag.addWarning(w));
      } catch (err: any) {
        diag.addWarning(`Gemini enrichment failed: ${err.message}`);
      }
    }
  } else {
    // PDF, image, document, text-paste -> Gemini primary
    try {
      const geminiResult = await parseWithGemini({
        fileName: input.fileName,
        mimeType: input.mimeType,
        dataBase64: input.dataBase64,
        extractedText: input.extractedText,
        parseStrategy: strategy,
        debugMode,
      });
      parsedLines = geminiResult.parsedLines;
      roomsFromParse = geminiResult.rooms;
      projectFromParse = geminiResult.project;
      modelUsed = geminiResult.modelUsed;
      extractionWarnings = geminiResult.warnings;
    } catch (err: any) {
      diag.addWarning(`Extraction failed: ${err.message}`);
    }
  }

  diag.setModel(modelUsed);
  extractionWarnings.forEach((w) => diag.addWarning(w));
  diag.setLinesExtracted(parsedLines.length);

  // --- STEP 2: Catalog Matching ---
  const matchResults = await matchLinesToCatalog(
    parsedLines.map((l) => ({
      id: l.id,
      itemCode: l.itemCode,
      itemName: l.itemName,
      description: l.description,
      category: l.category,
      unit: l.unit,
    })),
    catalog,
    useWebEnrichment
  );

  // --- STEP 3: Build full parsed lines with match data ---
  const fullParsedLines: IntakeParsedLine[] = parsedLines.map((line) => {
    const match = matchResults.get(line.id) || {
      matchedCatalogItemId: null,
      matchedSku: null,
      matchedDescription: null,
      matchStatus: 'needs_match' as const,
      confidence: 0,
      matchExplanation: 'No catalog match attempted',
      materialCost: 0,
      laborMinutes: 0,
    };
    return { ...line, ...match };
  });

  const linesMatched = fullParsedLines.filter((l) => l.matchStatus === 'matched').length;
  const linesNeedMatch = fullParsedLines.filter((l) => l.matchStatus === 'needs_match').length;
  diag.setLinesMatched(linesMatched);
  diag.setLinesNeedMatch(linesNeedMatch);

  // --- STEP 4: Build final project metadata ---
  const project: IntakeProject = {
    projectName: projectFromParse.projectName || '',
    projectNumber: projectFromParse.projectNumber || '',
    bidPackage: projectFromParse.bidPackage || '',
    client: projectFromParse.client || '',
    generalContractor: projectFromParse.generalContractor || '',
    address: projectFromParse.address || '',
    bidDate: projectFromParse.bidDate || '',
    estimator: projectFromParse.estimator || '',
    pricingMode: 'material_and_labor',
    sourceFiles: [input.fileName],
  };

  // --- STEP 5: Diagnostics ---
  if (!project.projectName) diag.addWarning('Project name could not be extracted; please fill in manually.');
  if (!project.address) diag.addWarning('Address could not be extracted; please fill in manually.');
  if (fullParsedLines.length === 0) diag.addWarning('No scope lines were extracted from this document.');

  const diagnostics = diag.build();

  return {
    project,
    rooms: roomsFromParse,
    parsedLines: fullParsedLines,
    assumptions: buildDefaultAssumptions(),
    proposalAssist: null,
    diagnostics,
  };
}
