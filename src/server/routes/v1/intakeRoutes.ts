import { Router } from 'express';
import { extractIntakeFromGemini } from '../../services/geminiIntakeExtraction.ts';

export const intakeRouter = Router();

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
