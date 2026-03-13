import { z } from 'zod';

export const intakeSourceTypeSchema = z.enum(['pdf', 'document', 'spreadsheet', 'image']);

export const intakeMatchStatusSchema = z.enum(['matched', 'needs_review', 'unmatched', 'ignored']);

export const intakeLaborBasisSchema = z.enum(['material_only', 'install_only', 'labor_and_material', 'unspecified']);

export const intakeParseRequestSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1).default('application/octet-stream'),
  sourceType: intakeSourceTypeSchema,
  dataBase64: z.string().optional(),
  extractedText: z.string().optional(),
  normalizedRows: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const intakeProjectSchema = z.object({
  projectName: z.string().default(''),
  projectNumber: z.string().default(''),
  client: z.string().default(''),
  gc: z.string().default(''),
  address: z.string().default(''),
  bidDate: z.string().default(''),
  estimator: z.string().default(''),
  pricingMode: intakeLaborBasisSchema.default('unspecified'),
  scopeSummary: z.string().default(''),
  sourceFiles: z.array(z.string()).default([]),
});

export const intakeRoomSchema = z.object({
  name: z.string().default(''),
  sourceReference: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0),
});

export const intakeMatchCandidateSchema = z.object({
  catalogItemId: z.string().default(''),
  sku: z.string().default(''),
  description: z.string().default(''),
  category: z.string().default(''),
  unit: z.string().default(''),
  score: z.number().min(0).max(1).default(0),
  reason: z.string().default(''),
});

export const intakeWebEnrichmentSchema = z.object({
  applied: z.boolean().default(false),
  query: z.string().default(''),
  summary: z.string().default(''),
  references: z.array(z.string()).default([]),
});

export const intakeParsedLineSchema = z.object({
  roomArea: z.string().default(''),
  category: z.string().default(''),
  itemCode: z.string().default(''),
  itemName: z.string().default(''),
  description: z.string().default(''),
  quantity: z.number().default(1),
  unit: z.string().default('EA'),
  notes: z.string().default(''),
  sourceReference: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0),
  matchStatus: intakeMatchStatusSchema.default('unmatched'),
  matchedCatalogItemId: z.string().nullable().default(null),
  matchedSku: z.string().nullable().default(null),
  matchReason: z.string().default(''),
  matchScore: z.number().min(0).max(1).default(0),
  matchCandidates: z.array(intakeMatchCandidateSchema).default([]),
  webEnrichment: intakeWebEnrichmentSchema.optional(),
});

export const intakeAssumptionsSchema = z.object({
  deliveryIncluded: z.boolean().nullable().default(null),
  tax: z.boolean().nullable().default(null),
  union: z.boolean().nullable().default(null),
  prevailingWage: z.boolean().nullable().default(null),
  laborBasis: intakeLaborBasisSchema.default('unspecified'),
  projectConditions: z.array(z.string()).default([]),
  specialNotes: z.array(z.string()).default([]),
});

export const intakeProposalDraftSchema = z.object({
  intro: z.string().default(''),
  terms: z.string().default(''),
  exclusions: z.array(z.string()).default([]),
  clarifications: z.array(z.string()).default([]),
});

export const intakeStrategySchema = z.object({
  classification: z.string().default(''),
  selectedStrategy: z.string().default(''),
  summary: z.string().default(''),
  primaryModel: z.string().default(''),
  supportingModels: z.array(z.string()).default([]),
  usedLocalSpreadsheetInterpretation: z.boolean().default(false),
  usedWebEnrichment: z.boolean().default(false),
});

export const intakeDiagnosticsSchema = z.object({
  warnings: z.array(z.string()).default([]),
  logs: z.array(z.string()).default([]),
  modelDecisions: z.array(z.string()).default([]),
  fallbackReasons: z.array(z.string()).default([]),
  webLookups: z.array(z.string()).default([]),
  confidenceBySection: z.object({
    project: z.number().min(0).max(1).default(0),
    scope: z.number().min(0).max(1).default(0),
    matching: z.number().min(0).max(1).default(0),
    assumptions: z.number().min(0).max(1).default(0),
  }),
});

export const intakeReviewSchema = z.object({
  matchedItems: z.number().int().nonnegative().default(0),
  needsMatchItems: z.number().int().nonnegative().default(0),
  ignoredItems: z.number().int().nonnegative().default(0),
  roomCount: z.number().int().nonnegative().default(0),
  assumptionSuggestions: z.number().int().nonnegative().default(0),
});

export const intakeParseResponseSchema = z.object({
  strategy: intakeStrategySchema,
  project: intakeProjectSchema,
  rooms: z.array(intakeRoomSchema).default([]),
  parsedLines: z.array(intakeParsedLineSchema).default([]),
  assumptions: intakeAssumptionsSchema,
  proposalDraft: intakeProposalDraftSchema,
  diagnostics: intakeDiagnosticsSchema,
  review: intakeReviewSchema,
});

export type IntakeParseRequest = z.infer<typeof intakeParseRequestSchema>;
export type IntakeProject = z.infer<typeof intakeProjectSchema>;
export type IntakeRoom = z.infer<typeof intakeRoomSchema>;
export type IntakeMatchCandidate = z.infer<typeof intakeMatchCandidateSchema>;
export type IntakeParsedLine = z.infer<typeof intakeParsedLineSchema>;
export type IntakeAssumptions = z.infer<typeof intakeAssumptionsSchema>;
export type IntakeProposalDraft = z.infer<typeof intakeProposalDraftSchema>;
export type IntakeStrategy = z.infer<typeof intakeStrategySchema>;
export type IntakeDiagnostics = z.infer<typeof intakeDiagnosticsSchema>;
export type IntakeReview = z.infer<typeof intakeReviewSchema>;
export type IntakeParseResponse = z.infer<typeof intakeParseResponseSchema>;