import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  IntakeAssumptions,
  IntakeParseRequest,
  IntakeProject,
  IntakeRoom,
  IntakeStrategy,
  intakeAssumptionsSchema,
  intakeParseRequestSchema,
  intakeParsedLineSchema,
  intakeProjectSchema,
  intakeRoomSchema,
} from '../../shared/types/intake.ts';
import { createGeminiClient, getGeminiRoutingConfig } from './geminiModelRouter.ts';
import { geminiIntakeExtractionSchema } from './structuredExtractionSchemas.ts';
import { summarizeStructuredSpreadsheet } from './spreadsheetInterpretationService.ts';

type GeminiPart = {
  text?: string;
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
  inlineData?: {
    mimeType: string;
    data: string;
  };
};

export interface GeminiParseResult {
  strategy: IntakeStrategy;
  project: IntakeProject;
  rooms: IntakeRoom[];
  parsedLines: Array<ReturnType<typeof intakeParsedLineSchema.parse>>;
  assumptions: IntakeAssumptions;
  warnings: string[];
  confidenceBySection: {
    project: number;
    scope: number;
    assumptions: number;
  };
  logs: string[];
}

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLaborBasis(value: unknown): IntakeAssumptions['laborBasis'] {
  const normalized = asText(value).toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  if (!normalized) return 'unspecified';
  if (/(material|furnish|supply)/.test(normalized) && !/(install|labor)/.test(normalized)) return 'material_only';
  if (/(install|labor)/.test(normalized) && !/(material|furnish|supply)/.test(normalized)) return 'install_only';
  if (/(install|labor)/.test(normalized) && /(material|furnish|supply)/.test(normalized)) return 'labor_and_material';
  if (/(turnkey|complete scope|full scope)/.test(normalized)) return 'labor_and_material';
  return 'unspecified';
}

function findRegexValue(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return asText(match[1]);
  }
  return '';
}

function cleanFileStem(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(?:bid package|takeoff|scope|matrix|sheet|spec(?:ification)?(?: excerpt)?|document|upload|final|rev(?:ision)?\s*[a-z0-9-]*)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRowValue(rows: IntakeParseRequest['normalizedRows'], patterns: RegExp[]): string {
  for (const row of rows || []) {
    for (const [key, value] of Object.entries(row || {})) {
      if (!patterns.some((pattern) => pattern.test(key))) continue;
      const text = asText(value);
      if (text) return text;
    }
  }
  return '';
}

function deriveHeuristicHints(input: IntakeParseRequest) {
  const text = input.extractedText || '';
  const lower = text.toLowerCase();

  const projectName = findRegexValue(text, [
    /(?:^|\n)\s*project(?:\s+name)?\s*[:#-]\s*(.+)$/im,
    /(?:^|\n)\s*job(?:\s+name)?\s*[:#-]\s*(.+)$/im,
  ]) || extractRowValue(input.normalizedRows, [/project/i, /job/i]) || cleanFileStem(input.fileName);

  return {
    project: {
      projectName,
      projectNumber: findRegexValue(text, [/(?:^|\n)\s*(?:project|job|bid)\s*(?:number|#|no\.?|id)\s*[:#-]\s*(.+)$/im]) || extractRowValue(input.normalizedRows, [/project\s*(number|#|no\.?)/i, /job\s*(number|#|no\.?)/i, /bid\s*(number|#|no\.?)/i]),
      client: findRegexValue(text, [/(?:^|\n)\s*(?:client|owner)\s*[:#-]\s*(.+)$/im]) || extractRowValue(input.normalizedRows, [/client/i, /owner/i]),
      gc: findRegexValue(text, [/(?:^|\n)\s*(?:gc|general contractor|contractor)\s*[:#-]\s*(.+)$/im]),
      address: findRegexValue(text, [/(?:^|\n)\s*(?:address|location|site)\s*[:#-]\s*(.+)$/im]) || extractRowValue(input.normalizedRows, [/address/i, /location/i, /site/i]),
      bidDate: findRegexValue(text, [/(?:^|\n)\s*(?:bid date|due date|proposal date)\s*[:#-]\s*(.+)$/im]) || extractRowValue(input.normalizedRows, [/bid\s*date/i, /due\s*date/i]),
    },
    assumptions: {
      deliveryIncluded: /delivery\s+(?:is\s+)?included|include(?:s|d)? delivery/.test(lower) ? true : null,
      union: /\bunion\b/.test(lower) ? true : null,
      prevailingWage: /prevailing wage/.test(lower) ? true : null,
      laborBasis: normalizeLaborBasis(
        /material only|furnish only|supply only/.test(lower)
          ? 'material_only'
          : /install only|labor only/.test(lower)
            ? 'install_only'
            : /furnish and install|labor and material|complete install/.test(lower)
              ? 'labor_and_material'
              : ''
      ),
      projectConditions: [
        /after[- ]hours|night work|off[- ]hours/.test(lower) ? 'After-hours work required.' : '',
        /occupied/.test(lower) ? 'Occupied building coordination required.' : '',
        /restricted access|limited access|secure area/.test(lower) ? 'Restricted site access expected.' : '',
        /phased|multi[- ]phase/.test(lower) ? 'Phased execution likely.' : '',
        /remote|travel/.test(lower) ? 'Remote travel or mobilization may be required.' : '',
        /schedule compression|fast[- ]track|accelerated schedule/.test(lower) ? 'Schedule compression may affect labor.' : '',
      ].filter(Boolean),
      specialNotes: [
        /delivery\s+(?:is\s+)?included|include(?:s|d)? delivery/.test(lower) ? 'Delivery appears to be included.' : '',
        /prevailing wage/.test(lower) ? 'Prevailing wage language detected.' : '',
        /\bunion\b/.test(lower) ? 'Union labor language detected.' : '',
      ].filter(Boolean),
    },
  };
}

function buildPrompt(input: IntakeParseRequest, attempt: 'primary' | 'fallback'): string {
  const spreadsheetSummary = summarizeStructuredSpreadsheet(input);
  return [
    'You are a preconstruction intake system for Division 10 and related construction scope.',
    'Your job is to classify the source, extract project details, normalize scope lines, detect rooms/areas, and surface job-condition assumptions.',
    'Return strict JSON matching the requested schema. Do not wrap the JSON in markdown.',
    'For spreadsheets, preserve row intent and column semantics instead of rewriting the sheet into prose.',
    'For PDFs, image-based documents, bid invites, and messy scope sheets, extract only information supported by the source and leave uncertain fields blank.',
    'When you detect pricing basis clues such as material only, furnish only, install only, prevailing wage, union, delivery included, phased work, or after-hours work, surface them in assumptions.',
    attempt === 'fallback'
      ? 'Fallback mode: if the source is messy, prefer partial but usable scope lines over returning an empty result.'
      : 'Primary mode: be precise, avoid guessed scope, and keep fields blank when evidence is weak.',
    `File Name: ${input.fileName}`,
    `Source Type Hint: ${input.sourceType}`,
    spreadsheetSummary ? `Local Spreadsheet Interpretation: ${spreadsheetSummary.summary}` : '',
    spreadsheetSummary ? `Spreadsheet Headers: ${spreadsheetSummary.headerKeys.join(', ')}` : '',
    spreadsheetSummary ? `Spreadsheet Rows: ${JSON.stringify(spreadsheetSummary.compactRows.slice(0, 120))}` : '',
    input.extractedText ? `Extracted Text Preview:\n${input.extractedText.slice(0, 18000)}` : '',
    'Return keys: classification, strategySummary, project, rooms, parsedLines, assumptions, warnings, confidence.',
    'parsedLines entries must be usable review rows with roomArea, category, itemCode, itemName, description, quantity, unit, notes, sourceReference, confidence.',
  ].filter(Boolean).join('\n');
}

async function createAttachmentPart(ai: GoogleGenAI, input: IntakeParseRequest): Promise<{ part: GeminiPart | null; tempFilePath: string | null }> {
  const shouldUploadBinary = Boolean(
    input.dataBase64 && (
      input.sourceType === 'pdf' ||
      input.sourceType === 'image' ||
      input.mimeType.toLowerCase().includes('pdf') ||
      input.mimeType.toLowerCase().startsWith('image/')
    )
  );

  if (!shouldUploadBinary || !input.dataBase64) {
    return { part: null, tempFilePath: null };
  }

  if (input.mimeType.toLowerCase().startsWith('image/')) {
    return {
      part: {
        inlineData: {
          mimeType: input.mimeType,
          data: input.dataBase64,
        },
      },
      tempFilePath: null,
    };
  }

  let tempFilePath: string | null = null;
  try {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-intake-'));
    tempFilePath = path.join(tmpDir, input.fileName || 'upload.pdf');
    await fs.writeFile(tempFilePath, Buffer.from(input.dataBase64, 'base64'));

    const uploaded = await ai.files.upload({
      file: tempFilePath,
      config: {
        mimeType: input.mimeType,
        displayName: input.fileName,
      },
    });

    if (uploaded.uri) {
      return {
        part: {
          fileData: {
            mimeType: input.mimeType,
            fileUri: uploaded.uri,
          },
        },
        tempFilePath,
      };
    }
  } catch (_error) {
    return {
      part: {
        inlineData: {
          mimeType: input.mimeType,
          data: input.dataBase64,
        },
      },
      tempFilePath,
    };
  }

  return { part: null, tempFilePath };
}

async function runExtractionAttempt(ai: GoogleGenAI, input: IntakeParseRequest, prompt: string, attachmentPart: GeminiPart | null, model: string, temperature: number) {
  const parts: GeminiPart[] = [{ text: prompt }];
  if (attachmentPart) parts.push(attachmentPart);

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema: geminiIntakeExtractionSchema,
    },
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch (_error) {
    parsed = {};
  }

  return {
    parsed,
    response,
  };
}

function normalizeParsedResult(raw: any, input: IntakeParseRequest, model: string): GeminiParseResult {
  const hints = deriveHeuristicHints(input);
  const project = intakeProjectSchema.parse({
    ...raw?.project,
    projectName: asText(raw?.project?.projectName) || hints.project.projectName,
    projectNumber: asText(raw?.project?.projectNumber) || hints.project.projectNumber,
    client: asText(raw?.project?.client) || hints.project.client,
    gc: asText(raw?.project?.gc) || hints.project.gc,
    address: asText(raw?.project?.address) || hints.project.address,
    bidDate: asText(raw?.project?.bidDate) || hints.project.bidDate,
    sourceFiles: [input.fileName],
  });
  const rooms = Array.isArray(raw?.rooms) ? raw.rooms.map((room: any) => intakeRoomSchema.parse({
    name: asText(room?.name),
    sourceReference: asText(room?.sourceReference),
    confidence: asNumber(room?.confidence, 0),
  })) : [];
  const parsedLines = Array.isArray(raw?.parsedLines)
    ? raw.parsedLines
        .map((line: any) => intakeParsedLineSchema.parse({
          roomArea: asText(line?.roomArea),
          category: asText(line?.category),
          itemCode: asText(line?.itemCode),
          itemName: asText(line?.itemName),
          description: asText(line?.description),
          quantity: asNumber(line?.quantity, 1) || 1,
          unit: asText(line?.unit) || 'EA',
          notes: asText(line?.notes),
          sourceReference: asText(line?.sourceReference) || input.fileName,
          confidence: Math.max(0, Math.min(1, asNumber(line?.confidence, 0.65))),
        }))
        .filter((line) => Boolean(line.description || line.itemName))
    : [];

  const assumptions = intakeAssumptionsSchema.parse({
    ...raw?.assumptions,
    deliveryIncluded: raw?.assumptions?.deliveryIncluded ?? hints.assumptions.deliveryIncluded,
    union: raw?.assumptions?.union ?? hints.assumptions.union,
    prevailingWage: raw?.assumptions?.prevailingWage ?? hints.assumptions.prevailingWage,
    laborBasis: normalizeLaborBasis(raw?.assumptions?.laborBasis || hints.assumptions.laborBasis),
    projectConditions: Array.from(new Set([
      ...(Array.isArray(raw?.assumptions?.projectConditions) ? raw.assumptions.projectConditions : []),
      ...hints.assumptions.projectConditions,
    ].map((entry) => asText(entry)).filter(Boolean))),
    specialNotes: Array.from(new Set([
      ...(Array.isArray(raw?.assumptions?.specialNotes) ? raw.assumptions.specialNotes : []),
      ...hints.assumptions.specialNotes,
    ].map((entry) => asText(entry)).filter(Boolean))),
  });

  return {
    strategy: {
      classification: asText(raw?.classification) || input.sourceType,
      selectedStrategy: input.normalizedRows?.length ? 'hybrid-structured-spreadsheet' : input.dataBase64 ? 'multimodal-document' : 'text-first-document',
      summary: asText(raw?.strategySummary) || `Gemini-first intake parsing using ${model}.`,
      primaryModel: model,
      supportingModels: [],
      usedLocalSpreadsheetInterpretation: Boolean(input.normalizedRows?.length),
      usedWebEnrichment: false,
    },
    project,
    rooms,
    parsedLines,
    assumptions,
    warnings: Array.isArray(raw?.warnings) ? raw.warnings.map((warning: unknown) => asText(warning)).filter(Boolean) : [],
    confidenceBySection: {
      project: Math.max(0, Math.min(1, asNumber(raw?.confidence?.project, project.projectName ? 0.8 : 0.25))),
      scope: Math.max(0, Math.min(1, asNumber(raw?.confidence?.scope, parsedLines.length > 0 ? 0.8 : 0.2))),
      assumptions: Math.max(0, Math.min(1, asNumber(raw?.confidence?.assumptions, assumptions.projectConditions.length > 0 ? 0.7 : 0.3))),
    },
    logs: [],
  };
}

function hasMeaningfulExtraction(result: GeminiParseResult): boolean {
  return Boolean(
    result.project.projectName ||
    result.project.projectNumber ||
    result.project.client ||
    result.rooms.length ||
    result.parsedLines.length
  );
}

export async function parseIntakeWithGemini(input: IntakeParseRequest): Promise<GeminiParseResult> {
  const request = intakeParseRequestSchema.parse(input);
  const routing = getGeminiRoutingConfig();
  const ai = createGeminiClient();
  const logs: string[] = [];

  let tempFilePath: string | null = null;
  try {
    const attachment = await createAttachmentPart(ai, request);
    tempFilePath = attachment.tempFilePath;

    const primaryAttempt = await runExtractionAttempt(
      ai,
      request,
      buildPrompt(request, 'primary'),
      attachment.part,
      routing.parse.model,
      routing.parse.temperature,
    );

    const primary = normalizeParsedResult(primaryAttempt.parsed, request, routing.parse.model);
    logs.push(`Primary extraction model: ${routing.parse.model}`);
    if (primaryAttempt.response.usageMetadata?.totalTokenCount) {
      logs.push(`Primary extraction tokens: ${primaryAttempt.response.usageMetadata.totalTokenCount}`);
    }

    if (hasMeaningfulExtraction(primary)) {
      return { ...primary, logs };
    }

    const fallbackAttempt = await runExtractionAttempt(
      ai,
      request,
      buildPrompt(request, 'fallback'),
      attachment.part,
      routing.summarize.model,
      routing.summarize.temperature,
    );

    const fallback = normalizeParsedResult(fallbackAttempt.parsed, request, routing.summarize.model);
    fallback.strategy.supportingModels = [routing.parse.model];
    fallback.warnings = Array.from(new Set([
      ...fallback.warnings,
      'Fallback Gemini extraction path was used. Review lines and assumptions before creating the project.',
    ]));
    logs.push(`Fallback extraction model: ${routing.summarize.model}`);
    if (fallbackAttempt.response.usageMetadata?.totalTokenCount) {
      logs.push(`Fallback extraction tokens: ${fallbackAttempt.response.usageMetadata.totalTokenCount}`);
    }
    return { ...fallback, logs };
  } finally {
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        await fs.rmdir(path.dirname(tempFilePath));
      } catch (_error) {
        // ignore temp cleanup errors
      }
    }
  }
}