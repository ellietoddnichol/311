import { Router } from 'express';
import { runIntakePipeline } from '../../services/parseRouterService.ts';
// Keep old extraction for backward-compat (legacy path still available)
import { extractIntakeFromGemini } from '../../services/geminiIntakeExtraction.ts';

export const intakeRouter = Router();

// New pipeline endpoint - handles all file types with full pipeline
intakeRouter.post('/parse', async (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    const mimeType = String(req.body?.mimeType || 'application/octet-stream').trim();
    const dataBase64 = req.body?.dataBase64 ? String(req.body.dataBase64) : undefined;
    const extractedText = req.body?.extractedText ? String(req.body.extractedText) : undefined;
    const catalogItems = Array.isArray(req.body?.catalogItems) ? req.body.catalogItems : [];
    const generateProposalAssist = Boolean(req.body?.generateProposalAssist);
    const useWebEnrichment = Boolean(req.body?.useWebEnrichment);

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required.' });
    }

    if (!dataBase64 && !extractedText) {
      return res.status(400).json({ error: 'Either dataBase64 or extractedText is required.' });
    }

    const result = await runIntakePipeline({
      fileName,
      mimeType,
      dataBase64,
      extractedText,
      catalogItems,
      generateProposalAssist,
      useWebEnrichment,
    });

    return res.json({ data: result });
  } catch (error: any) {
    console.error('[IntakeRoutes] /parse error:', error);
    return res.status(500).json({ error: error.message || 'Intake pipeline failed.' });
  }
});

// Legacy endpoint - maintained for backward compatibility
intakeRouter.post('/extract', async (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    const mimeType = String(req.body?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
    const sourceType = String(req.body?.sourceType || '').trim() as 'pdf' | 'document' | 'spreadsheet' | 'image';
    const dataBase64 = req.body?.dataBase64 ? String(req.body.dataBase64) : undefined;
    const extractedText = req.body?.extractedText ? String(req.body.extractedText) : undefined;
    const normalizedRows = Array.isArray(req.body?.normalizedRows) ? req.body.normalizedRows : undefined;

    if (!fileName || !sourceType) {
      return res.status(400).json({ error: 'fileName and sourceType are required.' });
    }

    if (!['pdf', 'document', 'spreadsheet', 'image'].includes(sourceType)) {
      return res.status(400).json({ error: 'sourceType must be pdf, image, document, or spreadsheet.' });
    }

    if ((sourceType === 'pdf' || sourceType === 'image') && !dataBase64) {
      return res.status(400).json({ error: 'dataBase64 is required for PDF or image extraction.' });
    }

    const result = await extractIntakeFromGemini({
      fileName,
      mimeType,
      sourceType,
      dataBase64,
      extractedText,
      normalizedRows,
    });

    return res.json({ data: result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Gemini extraction failed.' });
  }
});
