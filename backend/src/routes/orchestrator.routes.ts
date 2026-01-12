import express, { Request, Response } from 'express';
import { handleOrchestratorRequest } from '../agents/orchestratorAgent';

const router = express.Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { message, context } = req.body || {};

    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required' });
    }

    // context may be undefined or object
    const ctx = typeof context === 'object' && context !== null ? context : undefined;

    const result = await handleOrchestratorRequest(message, ctx as Record<string, unknown> | undefined);

    return res.status(200).json({ content: result.content, metadata: result.metadata ?? {} });
  } catch (err) {
    console.error('Orchestrator endpoint error:', err);
    return res.status(500).json({ error: 'Orchestrator error', details: 'Internal processing error' });
  }
});

export default router;
