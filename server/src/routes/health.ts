import { Router, Request, Response } from 'express';
import { HealthCheckResponse } from '../types';

const router = Router();

/**
 * GET /api/health
 * Health check endpoint to verify server status
 */
router.get('/', (_req: Request, res: Response<HealthCheckResponse>) => {
  const response: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  res.json(response);
});

export default router;
