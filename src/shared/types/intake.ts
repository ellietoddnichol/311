// Normalized Intake Schema - shared between server and client

export type IntakeMatchStatus = 'matched' | 'needs_match' | 'ignored' | 'pending';
export type IntakeParseStrategy = 'gemini-pdf' | 'gemini-image' | 'gemini-document' | 'spreadsheet-rows' | 'spreadsheet-matrix' | 'csv' | 'text-paste' | 'hybrid';

export interface IntakeParsedLine {
  id: string;
  roomArea: string;
  category: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
  notes: string;
  sourceReference: string;
  // matching
  matchStatus: IntakeMatchStatus;
  matchedCatalogItemId: string | null;
  matchedSku: string | null;
  matchedDescription: string | null;
  confidence: number; // 0-1
  matchExplanation: string;
  // cost (populated after match)
  materialCost: number;
  laborMinutes: number;
}

export interface IntakeRoom {
  id: string;
  name: string;
  sourceReference: string;
}

export interface IntakeAssumptions {
  deliveryIncluded: boolean | null;
  tax: boolean | null;
  union: boolean | null;
  prevailingWage: boolean | null;
  laborBasis: string;
  projectConditions: string[];
  specialNotes: string;
}

export interface IntakeProposalAssist {
  introDraft: string;
  scopeSummaryDraft: string;
  exclusionsDraft: string;
  clarificationsDraft: string;
}

export interface IntakeDiagnostics {
  parseStrategy: IntakeParseStrategy;
  modelUsed: string;
  warnings: string[];
  enrichmentUsed: boolean;
  confidenceSummary: string;
  sheetsDetected: string[];
  columnMapFound: boolean;
  matrixDetected: boolean;
  linesExtracted: number;
  linesMatched: number;
  linesNeedMatch: number;
}

export interface IntakeProject {
  projectName: string;
  projectNumber: string;
  bidPackage: string;
  client: string;
  generalContractor: string;
  address: string;
  bidDate: string;
  estimator: string;
  pricingMode: string;
  sourceFiles: string[];
}

export interface IntakeResult {
  project: IntakeProject;
  rooms: IntakeRoom[];
  parsedLines: IntakeParsedLine[];
  assumptions: IntakeAssumptions;
  proposalAssist: IntakeProposalAssist | null;
  diagnostics: IntakeDiagnostics;
}

// Input to the intake pipeline
export interface IntakeInput {
  fileName: string;
  mimeType: string;
  dataBase64?: string;
  extractedText?: string;
  // Optional: for catalog matching
  catalogItems?: Array<{
    id: string;
    sku: string;
    description: string;
    category: string;
    uom: string;
    baseMaterialCost: number;
    baseLaborMinutes: number;
    tags?: string[];
  }>;
  // Options
  generateProposalAssist?: boolean;
  useWebEnrichment?: boolean;
}
