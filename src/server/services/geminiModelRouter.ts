import { GoogleGenAI } from '@google/genai';

export type GeminiTask = 'parse' | 'match' | 'draft' | 'summarize';

export interface GeminiTaskConfig {
  model: string;
  temperature: number;
}

export interface GeminiRoutingConfig {
  parse: GeminiTaskConfig;
  match: GeminiTaskConfig;
  draft: GeminiTaskConfig;
  summarize: GeminiTaskConfig;
  enableWebEnrichment: boolean;
  enableProposalDraft: boolean;
  debugMode: boolean;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function resolveTaskConfig(task: GeminiTask, fallbackModel: string, fallbackTemperature: number): GeminiTaskConfig {
  const prefix = `GEMINI_${task.toUpperCase()}_MODEL`;
  const temperatureKey = `GEMINI_${task.toUpperCase()}_TEMPERATURE`;
  return {
    model: String(process.env[prefix] || fallbackModel).trim(),
    temperature: Number(process.env[temperatureKey] || fallbackTemperature),
  };
}

export function getGeminiApiKey(): string {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '').trim();
}

export function getGeminiRoutingConfig(): GeminiRoutingConfig {
  return {
    parse: resolveTaskConfig('parse', 'gemini-2.5-pro', 0.15),
    match: resolveTaskConfig('match', 'gemini-2.5-flash', 0.1),
    draft: resolveTaskConfig('draft', 'gemini-2.5-flash', 0.3),
    summarize: resolveTaskConfig('summarize', 'gemini-2.5-flash', 0.2),
    enableWebEnrichment: parseBoolean(process.env.ENABLE_WEB_ENRICHMENT, true),
    enableProposalDraft: parseBoolean(process.env.ENABLE_GEMINI_PROPOSAL_DRAFT, true),
    debugMode: parseBoolean(process.env.PARSER_DEBUG_MODE, false),
  };
}

export function createGeminiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY (or GOOGLE_GEMINI_API_KEY) is missing.');
  }
  return new GoogleGenAI({ apiKey });
}