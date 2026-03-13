import { Router } from 'express';
import { runIntakeParsePipeline } from '../../services/parseRouterService.ts';

export const intakeRouter = Router();

intakeRouter.post('/extract', async (req, res) => {
  try {
    const result = await runIntakeParsePipeline(req.body ?? {});

    return res.json({ data: result });
  } catch (error: any) {
    const message = error.message || 'Gemini extraction failed.';
    const status = /required|missing|invalid/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message });
  }
});
