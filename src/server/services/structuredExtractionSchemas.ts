import { Type } from '@google/genai';

export const geminiIntakeExtractionSchema = {
  type: Type.OBJECT,
  properties: {
    classification: { type: Type.STRING },
    strategySummary: { type: Type.STRING },
    project: {
      type: Type.OBJECT,
      properties: {
        projectName: { type: Type.STRING },
        projectNumber: { type: Type.STRING },
        client: { type: Type.STRING },
        gc: { type: Type.STRING },
        address: { type: Type.STRING },
        bidDate: { type: Type.STRING },
        estimator: { type: Type.STRING },
        pricingMode: { type: Type.STRING },
        scopeSummary: { type: Type.STRING },
        sourceFiles: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
    rooms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          sourceReference: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
      },
    },
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
          confidence: { type: Type.NUMBER },
        },
        required: ['description', 'quantity', 'unit'],
      },
    },
    assumptions: {
      type: Type.OBJECT,
      properties: {
        deliveryIncluded: { type: Type.BOOLEAN },
        tax: { type: Type.BOOLEAN },
        union: { type: Type.BOOLEAN },
        prevailingWage: { type: Type.BOOLEAN },
        laborBasis: { type: Type.STRING },
        projectConditions: { type: Type.ARRAY, items: { type: Type.STRING } },
        specialNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
    confidence: {
      type: Type.OBJECT,
      properties: {
        project: { type: Type.NUMBER },
        scope: { type: Type.NUMBER },
        assumptions: { type: Type.NUMBER },
      },
    },
  },
};

export const geminiMatchSelectionSchema = {
  type: Type.OBJECT,
  properties: {
    selectedCatalogItemId: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    reason: { type: Type.STRING },
  },
};

export const geminiWebEnrichmentSchema = {
  type: Type.OBJECT,
  properties: {
    normalizedName: { type: Type.STRING },
    manufacturer: { type: Type.STRING },
    categoryHints: { type: Type.ARRAY, items: { type: Type.STRING } },
    notes: { type: Type.STRING },
  },
};