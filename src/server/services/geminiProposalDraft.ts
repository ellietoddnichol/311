import { GoogleGenAI, Type } from '@google/genai';
import { ProjectRecord, SettingsRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { DEFAULT_PROPOSAL_CLARIFICATIONS, DEFAULT_PROPOSAL_EXCLUSIONS, DEFAULT_PROPOSAL_INTRO, DEFAULT_PROPOSAL_TERMS } from '../../shared/utils/proposalDefaults.ts';
import { IntakeAssumptions, IntakeParsedLine, IntakeProject, IntakeProposalDraft } from '../../shared/types/intake.ts';
import { createGeminiClient, getGeminiApiKey, getGeminiRoutingConfig } from './geminiModelRouter.ts';

interface ProposalDraftInput {
  mode?: 'scope_summary' | 'proposal_text' | 'terms_and_conditions';
  project?: ProjectRecord;
  lines?: TakeoffLineRecord[];
  summary?: {
    materialSubtotal: number;
    laborSubtotal: number;
    adjustedLaborSubtotal: number;
    totalLaborHours: number;
    durationDays: number;
    lineSubtotal: number;
    conditionAdjustmentAmount: number;
    conditionLaborMultiplier: number;
    burdenAmount: number;
    overheadAmount: number;
    profitAmount: number;
    taxAmount: number;
    baseBidTotal: number;
    conditionAssumptions: string[];
  } | null;
  settings?: Partial<SettingsRecord>;
}

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function limitToTwoSentences(value: unknown): string {
  const normalized = asText(value).replace(/\s+/g, ' ');
  if (!normalized) return '';

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');
}

function summarizeLines(lines: TakeoffLineRecord[]): Array<Record<string, unknown>> {
  return lines
    .slice()
    .sort((left, right) => right.lineTotal - left.lineTotal)
    .slice(0, 60)
    .map((line) => ({
      room: line.roomId,
      category: line.category || '',
      description: line.description,
      qty: line.qty,
      unit: line.unit,
      materialCost: line.materialCost,
      laborMinutes: line.laborMinutes,
      lineTotal: line.lineTotal,
      notes: line.notes || '',
    }));
}

export async function generateProposalDraftFromGemini(input: ProposalDraftInput): Promise<Partial<SettingsRecord>> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini proposal drafting is not configured. Set GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY.');
  }

  if (!input.project) {
    throw new Error('project is required.');
  }

  const ai = createGeminiClient();
  const routing = getGeminiRoutingConfig();
  const mode = input.mode || 'proposal_text';
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const assumptions = Array.isArray(input.summary?.conditionAssumptions) ? input.summary?.conditionAssumptions : [];

  const prompt = [
    'You are a construction estimator proposal writing assistant.',
    'Draft concise, professional proposal language from the estimate data provided.',
    'Use the estimate data as source material. Do not invent scope that is not supported by the input.',
    'Keep the language client-facing and commercially usable.',
    'Each populated proposal field must be no more than two sentences, and one sentence is preferred whenever possible.',
    'Do not use bullet points, numbering, headings, or line breaks in any generated field.',
    mode === 'scope_summary'
      ? 'Focus on drafting a clean scope summary for the proposal intro field. Leave other fields blank unless a change is strongly warranted.'
      : mode === 'terms_and_conditions'
        ? 'Improve the proposal terms, exclusions, and clarifications using the estimate scope and project assumptions. Keep the proposal intro unchanged unless necessary.'
        : 'Draft proposal intro, terms, exclusions, and clarifications. Improve readability while preserving practical construction assumptions.',
    '',
    `Project Name: ${input.project.projectName}`,
    `Client: ${input.project.clientName || ''}`,
    `Address: ${input.project.address || ''}`,
    `Pricing Mode: ${input.project.pricingMode || 'labor_and_material'}`,
    `Base Bid Total: ${input.summary?.baseBidTotal || 0}`,
    `Total Labor Hours: ${input.summary?.totalLaborHours || 0}`,
    `Duration Days: ${input.summary?.durationDays || 0}`,
    assumptions.length ? `Project Assumptions: ${assumptions.join('; ')}` : 'Project Assumptions: none stated',
    `Current Proposal Intro: ${asText(input.settings?.proposalIntro)}`,
    `Current Proposal Terms: ${asText(input.settings?.proposalTerms)}`,
    `Current Proposal Exclusions: ${asText(input.settings?.proposalExclusions)}`,
    `Current Proposal Clarifications: ${asText(input.settings?.proposalClarifications)}`,
    `Default Intro: ${DEFAULT_PROPOSAL_INTRO}`,
    `Default Terms: ${DEFAULT_PROPOSAL_TERMS}`,
    `Default Exclusions: ${DEFAULT_PROPOSAL_EXCLUSIONS}`,
    `Default Clarifications: ${DEFAULT_PROPOSAL_CLARIFICATIONS}`,
    `Estimate Line Snapshot: ${JSON.stringify(summarizeLines(lines))}`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: routing.draft.model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: routing.draft.temperature,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          proposalIntro: { type: Type.STRING },
          proposalTerms: { type: Type.STRING },
          proposalExclusions: { type: Type.STRING },
          proposalClarifications: { type: Type.STRING },
        },
      },
    },
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch (_error) {
    parsed = {};
  }

  if (mode === 'scope_summary') {
    return {
      proposalIntro: limitToTwoSentences(parsed.proposalIntro) || DEFAULT_PROPOSAL_INTRO,
    };
  }

  if (mode === 'terms_and_conditions') {
    return {
      proposalTerms: limitToTwoSentences(parsed.proposalTerms) || DEFAULT_PROPOSAL_TERMS,
      proposalExclusions: limitToTwoSentences(parsed.proposalExclusions) || DEFAULT_PROPOSAL_EXCLUSIONS,
      proposalClarifications: limitToTwoSentences(parsed.proposalClarifications) || DEFAULT_PROPOSAL_CLARIFICATIONS,
    };
  }

  return {
    proposalIntro: limitToTwoSentences(parsed.proposalIntro) || DEFAULT_PROPOSAL_INTRO,
    proposalTerms: limitToTwoSentences(parsed.proposalTerms) || DEFAULT_PROPOSAL_TERMS,
    proposalExclusions: limitToTwoSentences(parsed.proposalExclusions) || DEFAULT_PROPOSAL_EXCLUSIONS,
    proposalClarifications: limitToTwoSentences(parsed.proposalClarifications) || DEFAULT_PROPOSAL_CLARIFICATIONS,
  };
}

function defaultIntakeProposalDraft(): IntakeProposalDraft {
  return {
    intro: DEFAULT_PROPOSAL_INTRO,
    terms: DEFAULT_PROPOSAL_TERMS,
    exclusions: DEFAULT_PROPOSAL_EXCLUSIONS.split(/(?<=[.!?])\s+/).filter(Boolean),
    clarifications: DEFAULT_PROPOSAL_CLARIFICATIONS.split(/(?<=[.!?])\s+/).filter(Boolean),
  };
}

function summarizeIntakeLines(lines: IntakeParsedLine[]): Array<Record<string, unknown>> {
  return lines.slice(0, 50).map((line) => ({
    roomArea: line.roomArea,
    category: line.category,
    itemCode: line.itemCode,
    itemName: line.itemName,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    matchStatus: line.matchStatus,
  }));
}

export async function generateProposalDraftFromIntake(input: {
  project: IntakeProject;
  assumptions: IntakeAssumptions;
  parsedLines: IntakeParsedLine[];
}): Promise<IntakeProposalDraft> {
  const routing = getGeminiRoutingConfig();
  if (!routing.enableProposalDraft || !getGeminiApiKey()) {
    return defaultIntakeProposalDraft();
  }

  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: routing.draft.model,
    contents: [{ role: 'user', parts: [{ text: [
      'Draft proposal-support text from accepted or reviewable construction intake scope.',
      'Return strict JSON only.',
      'Keep the intro and terms concise. Exclusions and clarifications should be practical short list items.',
      `Project: ${JSON.stringify(input.project)}`,
      `Assumptions: ${JSON.stringify(input.assumptions)}`,
      `Scope Snapshot: ${JSON.stringify(summarizeIntakeLines(input.parsedLines))}`,
    ].join('\n') }] }],
    config: {
      temperature: routing.draft.temperature,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intro: { type: Type.STRING },
          terms: { type: Type.STRING },
          exclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
          clarifications: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch (_error) {
    parsed = {};
  }

  return {
    intro: limitToTwoSentences(parsed.intro) || DEFAULT_PROPOSAL_INTRO,
    terms: limitToTwoSentences(parsed.terms) || DEFAULT_PROPOSAL_TERMS,
    exclusions: Array.isArray(parsed.exclusions) && parsed.exclusions.length > 0
      ? parsed.exclusions.map((value: unknown) => asText(value)).filter(Boolean)
      : defaultIntakeProposalDraft().exclusions,
    clarifications: Array.isArray(parsed.clarifications) && parsed.clarifications.length > 0
      ? parsed.clarifications.map((value: unknown) => asText(value)).filter(Boolean)
      : defaultIntakeProposalDraft().clarifications,
  };
}