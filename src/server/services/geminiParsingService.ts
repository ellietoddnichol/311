import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { IntakeProject, IntakeParsedLine, IntakeRoom } from '../../shared/types/intake.ts';

export interface GeminiParseInput {
  fileName: string;
  mimeType: string;
  dataBase64?: string;
  extractedText?: string;
  normalizedRows?: Array<Record<string, unknown>>;
  parseStrategy: string;
  debugMode?: boolean;
}

export interface GeminiParseOutput {
  project: IntakeProject;
  rooms: IntakeRoom[];
  parsedLines: Omit<IntakeParsedLine, 'matchStatus' | 'matchedCatalogItemId' | 'matchedSku' | 'matchedDescription' | 'confidence' | 'matchExplanation' | 'materialCost' | 'laborMinutes'>[];
  modelUsed: string;
  warnings: string[];
}

type GeminiPart = {
  text?: string;
  fileData?: { mimeType: string; fileUri: string };
  inlineData?: { mimeType: string; data: string };
};

function getModelName(envKey: string, fallback: string): string {
  return process.env[envKey] || process.env['GEMINI_PARSE_MODEL'] || fallback;
}

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function asNumber(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function makeLineId(): string {
  return `line-${crypto.randomUUID()}`;
}

function makeRoomId(): string {
  return `room-${crypto.randomUUID()}`;
}

function buildParsePrompt(input: GeminiParseInput, mode: 'primary' | 'fallback'): string {
  const lines: string[] = [
    'You are a highly experienced construction estimating intake engine.',
    'Your job is to extract structured project data from construction documents with precision.',
    '',
    '== PROJECT METADATA EXTRACTION ==',
    'Carefully scan the ENTIRE document for:',
    '- Project name (look in headers, title blocks, cover pages, filename)',
    '- Project number / bid package number',
    '- Client / owner name',
    '- General contractor name',
    '- Site address / location',
    '- Bid due date / proposal date',
    '- Estimator name',
    '',
    'IMPORTANT METADATA RULES:',
    '- If a value is present anywhere in the document, extract it - do not leave it blank',
    '- Look at document headers, title blocks, footers, cover sheets, and repeating labels',
    '- For addresses: extract full street address, city, state if present',
    '- For dates: normalize to YYYY-MM-DD format',
    '- If the project name appears in a header/title, use that - do not use the filename',
    '- Mark confidence LOW if metadata was inferred rather than explicitly stated',
    '',
    '== SCOPE / TAKEOFF LINE EXTRACTION ==',
    'Extract ALL visible scope items, fixture counts, material quantities, and work items.',
    'For each line:',
    '- roomArea: room or area name (only if clearly stated - do not invent room names)',
    '- category: work type (e.g., Toilet Accessories, Partitions, Signage, ADA, Hardware)',
    '- itemCode: product code / SKU / spec number if visible',
    '- itemName: short product/item name',
    '- description: full description of the work item',
    '- quantity: numeric quantity (default 1 if not stated)',
    '- unit: unit of measure (EA, LF, SF, LS, etc.)',
    '- notes: installation notes, special conditions, spec references',
    '- sourceReference: where in the document this came from (e.g., "Sheet A-101, Room 101")',
    '',
    'SCOPE EXTRACTION RULES:',
    mode === 'fallback'
      ? '- Fallback mode: include any likely scope item even if partially stated'
      : '- Primary mode: only extract items clearly identifiable as scope/takeoff items',
    '- Do NOT merge multiple items into one line',
    '- Do NOT create giant room name strings from concatenated text',
    '- Do NOT invent quantities - use 1 if not stated',
    '- For schedules/fixture plans: extract each tagged item',
    '- For keynote lists: extract each keynote as a separate line',
    '- For partition schedules: extract each partition type',
    '- Look for: fixture schedules, hardware schedules, accessory lists, keynote legends',
    '',
    '== ROOMS ==',
    'List all distinct rooms/areas mentioned in the document.',
    'Only include rooms that are explicitly named - do not invent or infer room names.',
    '',
    `Source File: ${input.fileName}`,
    `Parse Strategy: ${input.parseStrategy}`,
    input.extractedText ? `\nExtracted Text (truncated to 14000 chars):\n${input.extractedText.slice(0, 14000)}` : '',
    input.normalizedRows?.length
      ? `\nSpreadsheet Rows (JSON, max 500 rows):\n${JSON.stringify(input.normalizedRows.slice(0, 500))}`
      : '',
    '',
    'Return a JSON object with exactly these keys:',
    '  projectName, projectNumber, bidPackage, client, generalContractor, address, bidDate, estimator,',
    '  rooms (array of strings),',
    '  parsedLines (array of objects with: roomArea, category, itemCode, itemName, description, quantity, unit, notes, sourceReference),',
    '  warnings (array of strings for any issues or low-confidence extractions)',
  ];

  return lines.filter((l) => l !== null).join('\n');
}

async function runGeminiExtraction(
  ai: GoogleGenAI,
  prompt: string,
  attachmentPart: GeminiPart | null,
  modelName: string,
  useSchema: boolean
): Promise<any> {
  const parts: GeminiPart[] = [{ text: prompt }];
  if (attachmentPart) parts.push(attachmentPart);

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts }],
    config: useSchema
      ? {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              projectName: { type: Type.STRING },
              projectNumber: { type: Type.STRING },
              bidPackage: { type: Type.STRING },
              client: { type: Type.STRING },
              generalContractor: { type: Type.STRING },
              address: { type: Type.STRING },
              bidDate: { type: Type.STRING },
              estimator: { type: Type.STRING },
              rooms: { type: Type.ARRAY, items: { type: Type.STRING } },
              parsedLines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    roomArea: { type: Type.STRING },
                    category: { type: Type.STRING },
                    itemCode: { type: Type.STRING },
                    itemName: { type: Type.STRING },
                    description: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    notes: { type: Type.STRING },
                    sourceReference: { type: Type.STRING },
                  },
                  required: ['description', 'quantity', 'unit'],
                },
              },
              warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['projectName', 'projectNumber', 'client', 'address', 'parsedLines', 'rooms'],
          },
        }
      : { responseMimeType: 'application/json' },
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch {
    return {};
  }
}

function normalizeOutput(raw: any, fileName: string): GeminiParseOutput {
  const parsedLines = Array.isArray(raw?.parsedLines)
    ? raw.parsedLines
        .map((line: any) => ({
          id: makeLineId(),
          roomArea: asText(line?.roomArea),
          category: asText(line?.category),
          itemCode: asText(line?.itemCode),
          itemName: asText(line?.itemName),
          description: asText(line?.description) || asText(line?.itemName),
          quantity: asNumber(line?.quantity, 1),
          unit: asText(line?.unit) || 'EA',
          notes: asText(line?.notes),
          sourceReference: asText(line?.sourceReference),
        }))
        .filter((l: any) => l.description || l.itemName)
    : [];

  const rooms = Array.isArray(raw?.rooms)
    ? raw.rooms
        .map((r: unknown) => asText(r))
        .filter(Boolean)
        .map((name: string) => ({ id: makeRoomId(), name, sourceReference: '' }))
    : [];

  const project: IntakeProject = {
    projectName: asText(raw?.projectName),
    projectNumber: asText(raw?.projectNumber),
    bidPackage: asText(raw?.bidPackage),
    client: asText(raw?.client),
    generalContractor: asText(raw?.generalContractor),
    address: asText(raw?.address),
    bidDate: asText(raw?.bidDate),
    estimator: asText(raw?.estimator),
    pricingMode: 'material_and_labor',
    sourceFiles: [fileName],
  };

  const warnings = Array.isArray(raw?.warnings)
    ? raw.warnings.map((w: unknown) => asText(w)).filter(Boolean)
    : [];

  return { project, rooms, parsedLines, modelUsed: '', warnings };
}

export async function parseWithGemini(input: GeminiParseInput): Promise<GeminiParseOutput> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing.');

  const ai = new GoogleGenAI({ apiKey });
  const modelName = getModelName('GEMINI_PARSE_MODEL', 'gemini-2.5-flash');
  const debugMode = input.debugMode || process.env.PARSER_DEBUG_MODE === 'true';

  let tempFilePath: string | null = null;
  try {
    let attachmentPart: GeminiPart | null = null;

    const isImage = input.mimeType.toLowerCase().startsWith('image/');
    const isPdf = input.mimeType.toLowerCase().includes('pdf') || input.parseStrategy.includes('pdf');
    const shouldAttach = Boolean(input.dataBase64 && (isImage || isPdf));

    if (shouldAttach && input.dataBase64) {
      if (isImage) {
        attachmentPart = { inlineData: { mimeType: input.mimeType, data: input.dataBase64 } };
      } else {
        try {
          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-parse-'));
          tempFilePath = path.join(tmpDir, input.fileName || 'upload.pdf');
          await fs.writeFile(tempFilePath, Buffer.from(input.dataBase64, 'base64'));
          const uploaded = await ai.files.upload({
            file: tempFilePath,
            config: { mimeType: input.mimeType, displayName: input.fileName },
          });
          if (uploaded.uri) {
            attachmentPart = { fileData: { mimeType: input.mimeType, fileUri: uploaded.uri } };
          }
        } catch {
          attachmentPart = { inlineData: { mimeType: input.mimeType, data: input.dataBase64 } };
        }
      }
    }

    const primaryPrompt = buildParsePrompt(input, 'primary');
    if (debugMode) console.log('[GeminiParsingService] Primary extraction attempt');

    const primaryRaw = await runGeminiExtraction(ai, primaryPrompt, attachmentPart, modelName, true);
    const primary = normalizeOutput(primaryRaw, input.fileName);
    primary.modelUsed = modelName;

    const hasMeaningful = primary.parsedLines.length > 0 || primary.project.projectName || primary.project.address;
    if (hasMeaningful) return primary;

    if (debugMode) console.log('[GeminiParsingService] Fallback extraction attempt');
    const fallbackPrompt = buildParsePrompt(input, 'fallback');
    const fallbackRaw = await runGeminiExtraction(ai, fallbackPrompt, attachmentPart, modelName, false);
    const fallback = normalizeOutput(fallbackRaw, input.fileName);
    fallback.modelUsed = modelName;

    if (fallback.parsedLines.length > 0) {
      fallback.warnings.push('Fallback extraction was used - review results carefully before importing.');
    }
    return fallback;
  } finally {
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        await fs.rmdir(path.dirname(tempFilePath));
      } catch {
        // ignore
      }
    }
  }
}
