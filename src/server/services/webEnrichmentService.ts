import { createGeminiClient, getGeminiRoutingConfig } from './geminiModelRouter.ts';
import { geminiWebEnrichmentSchema } from './structuredExtractionSchemas.ts';
import { IntakeParsedLine, intakeWebEnrichmentSchema } from '../../shared/types/intake.ts';

function shouldLookup(line: IntakeParsedLine): boolean {
  const code = String(line.itemCode || '').trim();
  const description = String(line.itemName || line.description || '').trim();
  if (!description) return false;
  if (code && /[A-Z]{2,}[\-\d]{2,}/i.test(code)) return true;
  return description.split(/\s+/).length <= 8 && /[A-Z]{2,}|\d/.test(description);
}

export async function enrichUnknownLineFromWeb(line: IntakeParsedLine): Promise<ReturnType<typeof intakeWebEnrichmentSchema.parse> | null> {
  const routing = getGeminiRoutingConfig();
  if (!routing.enableWebEnrichment || !shouldLookup(line)) {
    return null;
  }

  const ai = createGeminiClient();
  const query = [line.itemCode, line.itemName, line.description, line.category].filter(Boolean).join(' ').trim();
  if (!query) return null;

  const response = await ai.models.generateContent({
    model: routing.summarize.model,
    contents: [{ role: 'user', parts: [{ text: [
      'Use selective web grounding to clarify an ambiguous construction or catalog line item.',
      'Return JSON only.',
      `Query: ${query}`,
      `Known category: ${line.category || 'unknown'}`,
      'Provide the most likely normalized name, likely manufacturer if visible, category hints, and a short note about what this code or item appears to represent.',
    ].join('\n') }] }],
    config: {
      temperature: routing.summarize.temperature,
      responseMimeType: 'application/json',
      responseSchema: geminiWebEnrichmentSchema,
      tools: [{ googleSearch: {} } as any],
    },
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch (_error) {
    parsed = {};
  }

  const groundingChunks = (response as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks
    || (response as any)?.groundingMetadata?.groundingChunks
    || [];
  const references = groundingChunks
    .map((chunk: any) => chunk?.web?.uri || chunk?.web?.title || '')
    .filter(Boolean)
    .slice(0, 5);

  return intakeWebEnrichmentSchema.parse({
    applied: true,
    query,
    summary: [parsed.normalizedName, parsed.manufacturer, parsed.notes].filter(Boolean).join(' | '),
    references,
  });
}