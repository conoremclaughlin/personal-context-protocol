/**
 * Hook Lifecycle Routes
 *
 * REST endpoints for deterministic session lifecycle management.
 * Called by CLI hooks (on-prompt, on-stop, pre-compact, post-compact) — NOT by agents.
 * Bypasses MCP entirely so lifecycle state stays out of agent-facing tool schemas.
 */

import { Router, type Request, type Response } from 'express';
import type { DataComposer } from '../data/composer';
import { logger } from '../utils/logger';

const VALID_LIFECYCLES = ['running', 'idle', 'compacting', 'completed', 'failed'] as const;
type Lifecycle = (typeof VALID_LIFECYCLES)[number];

export function createHookLifecycleRouter(dataComposer: DataComposer): Router {
  const router = Router();

  /**
   * POST /api/hooks/lifecycle
   *
   * Update a session's lifecycle state. Called by CLI hooks:
   *   on-prompt  → lifecycle: 'running'
   *   on-stop    → lifecycle: 'idle'
   *   pre-compact → lifecycle: 'compacting'
   *   post-compact → lifecycle: 'idle'
   *
   * Body: { sessionId, lifecycle, agentId?, workingDir? }
   */
  router.post('/lifecycle', async (req: Request, res: Response) => {
    try {
      const { sessionId, lifecycle, agentId, workingDir } = req.body as {
        sessionId?: string;
        lifecycle?: string;
        agentId?: string;
        workingDir?: string;
      };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!lifecycle || !VALID_LIFECYCLES.includes(lifecycle as Lifecycle)) {
        res.status(400).json({
          success: false,
          error: `lifecycle must be one of: ${VALID_LIFECYCLES.join(', ')}`,
        });
        return;
      }

      const updates: { lifecycle: string; workingDir?: string } = { lifecycle };
      if (workingDir) updates.workingDir = workingDir;

      const updated = await dataComposer.repositories.memory.updateSession(sessionId, updates);

      if (!updated) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      logger.debug('[HookLifecycle] Updated', { sessionId, lifecycle, agentId });
      res.json({ success: true, sessionId, lifecycle });
    } catch (error) {
      logger.error('[HookLifecycle] Error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  return router;
}
