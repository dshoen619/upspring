/**
 * Search History API Routes
 * Endpoints for managing search history and cached results
 */

import { Router, Request, Response } from 'express';
import { searchHistoryService } from '../services/searchHistory';
import { SearchHistoryResponse, CachedSearchResponse } from '../types/searchHistory';

const router = Router();

/**
 * Logger for request debugging
 */
const log = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.info(`[INFO] [SearchHistoryRoute] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] [SearchHistoryRoute] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] [SearchHistoryRoute] ${message}`, meta ? JSON.stringify(meta) : '');
  },
};

/**
 * GET /api/search-history
 * Get recent searches
 *
 * Query Parameters:
 * - limit (optional): Maximum number of results to return (default: 20, max: 100)
 */
router.get('/', async (req: Request, res: Response<SearchHistoryResponse>) => {
  const { limit } = req.query;

  log.info('Get recent searches request received', {
    limit,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Parse and validate limit parameter
  let parsedLimit = 20;
  if (limit) {
    parsedLimit = parseInt(String(limit), 10);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      log.warn('Invalid limit parameter', { limit });
      return res.status(400).json({
        success: false,
        error: 'Limit must be a positive number.',
      });
    }
    // Cap at 100
    parsedLimit = Math.min(parsedLimit, 100);
  }

  try {
    const history = await searchHistoryService.getRecentSearches(parsedLimit);

    log.info('Recent searches retrieved successfully', { count: history.length });

    return res.json({
      success: true,
      history,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    log.error('Failed to get recent searches', { error: errorMessage });

    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'Failed to retrieve search history. Please try again later.'
        : errorMessage,
    });
  }
});

/**
 * GET /api/search-history/:searchId
 * Get a specific search by ID
 */
router.get('/:searchId', async (req: Request, res: Response<CachedSearchResponse>) => {
  const { searchId } = req.params;

  log.info('Get search by ID request received', {
    searchId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Validate searchId
  if (!searchId || typeof searchId !== 'string' || searchId.trim().length === 0) {
    log.warn('Missing or invalid searchId parameter');
    return res.status(400).json({
      success: false,
      error: 'Search ID is required.',
    });
  }

  try {
    const item = await searchHistoryService.getSearchById(searchId.trim());

    if (!item) {
      log.info('Search not found', { searchId });
      return res.status(404).json({
        success: false,
        error: 'Search not found.',
      });
    }

    log.info('Search retrieved successfully', { searchId, brand: item.brand });

    return res.json({
      success: true,
      item,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    log.error('Failed to get search by ID', { searchId, error: errorMessage });

    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'Failed to retrieve search. Please try again later.'
        : errorMessage,
    });
  }
});

/**
 * DELETE /api/search-history/:searchId
 * Delete a search by ID
 */
router.delete('/:searchId', async (req: Request, res: Response) => {
  const { searchId } = req.params;

  log.info('Delete search request received', {
    searchId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Validate searchId
  if (!searchId || typeof searchId !== 'string' || searchId.trim().length === 0) {
    log.warn('Missing or invalid searchId parameter');
    return res.status(400).json({
      success: false,
      error: 'Search ID is required.',
    });
  }

  try {
    // First check if the search exists
    const existingItem = await searchHistoryService.getSearchById(searchId.trim());

    if (!existingItem) {
      log.info('Search not found for deletion', { searchId });
      return res.status(404).json({
        success: false,
        error: 'Search not found.',
      });
    }

    await searchHistoryService.deleteSearch(searchId.trim());

    log.info('Search deleted successfully', { searchId });

    return res.json({
      success: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    log.error('Failed to delete search', { searchId, error: errorMessage });

    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'Failed to delete search. Please try again later.'
        : errorMessage,
    });
  }
});

export default router;
