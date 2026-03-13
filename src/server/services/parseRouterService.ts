import {
  IntakeParseResponse,
  intakeParseRequestSchema,
  intakeParseResponseSchema,
} from '../../shared/types/intake.ts';
import { listActiveCatalogItems } from '../repos/catalogRepo.ts';
import { getGeminiRoutingConfig } from './geminiModelRouter.ts';
import { parseIntakeWithGemini } from './geminiParsingService.ts';
import { matchParsedLinesToCatalog } from './catalogMatchService.ts';
import { generateProposalDraftFromIntake } from './geminiProposalDraft.ts';

export async function runIntakeParsePipeline(input: unknown): Promise<IntakeParseResponse> {
  const request = intakeParseRequestSchema.parse(input);
  const routing = getGeminiRoutingConfig();

  const parsed = await parseIntakeWithGemini(request);
  const catalog = listActiveCatalogItems();
  const matchResult = await matchParsedLinesToCatalog(parsed.parsedLines, catalog);

  const proposalDraft = routing.enableProposalDraft
    ? await generateProposalDraftFromIntake({
        project: parsed.project,
        assumptions: parsed.assumptions,
        parsedLines: matchResult.parsedLines.filter((line) => line.matchStatus !== 'ignored'),
      })
    : {
        intro: '',
        terms: '',
        exclusions: [],
        clarifications: [],
      };

  const review = {
    matchedItems: matchResult.parsedLines.filter((line) => line.matchStatus === 'matched').length,
    needsMatchItems: matchResult.parsedLines.filter((line) => line.matchStatus === 'needs_review' || line.matchStatus === 'unmatched').length,
    ignoredItems: matchResult.parsedLines.filter((line) => line.matchStatus === 'ignored').length,
    roomCount: parsed.rooms.length,
    assumptionSuggestions: parsed.assumptions.projectConditions.length + parsed.assumptions.specialNotes.length,
  };

  return intakeParseResponseSchema.parse({
    strategy: {
      ...parsed.strategy,
      supportingModels: Array.from(new Set([
        ...parsed.strategy.supportingModels,
        routing.match.model,
        routing.enableProposalDraft ? routing.draft.model : '',
      ].filter(Boolean))),
      usedWebEnrichment: matchResult.usedWebEnrichment,
    },
    project: parsed.project,
    rooms: parsed.rooms,
    parsedLines: matchResult.parsedLines,
    assumptions: parsed.assumptions,
    proposalDraft,
    diagnostics: {
      warnings: Array.from(new Set([...parsed.warnings, ...matchResult.warnings])),
      logs: [...parsed.logs, ...matchResult.logs],
      modelDecisions: [
        `Parsing model: ${routing.parse.model}`,
        `Match model: ${routing.match.model}`,
        routing.enableProposalDraft ? `Draft model: ${routing.draft.model}` : 'Draft model disabled',
      ],
      fallbackReasons: parsed.warnings.filter((warning) => /fallback/i.test(warning)),
      webLookups: matchResult.logs.filter((entry) => entry.includes('Web enrichment')),
      confidenceBySection: {
        project: parsed.confidenceBySection.project,
        scope: parsed.confidenceBySection.scope,
        matching: matchResult.averageConfidence,
        assumptions: parsed.confidenceBySection.assumptions,
      },
    },
    review,
  });
}