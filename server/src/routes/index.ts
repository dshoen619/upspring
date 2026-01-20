/**
 * API Routes Index
 * Central routing configuration for all API endpoints
 */

import { Router } from 'express';
import healthRouter from './health';
import adsRouter from './ads';
import aiRouter from './ai';
import brandsRouter from './brands';

const router = Router();

// Mount route handlers
router.use('/health', healthRouter);
router.use('/ads', adsRouter);
router.use('/ai', aiRouter);
router.use('/brands', brandsRouter);

export default router;
