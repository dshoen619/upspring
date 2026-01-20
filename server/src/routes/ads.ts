/**
 * Ads API Routes
 * Endpoints for searching and fetching ads from Google Ads Transparency Center
 */

import { Router, Request, Response } from 'express';
import { GoogleAdsService } from '../services/google-ads';
import { Ad, ApifyError, ApifyErrorCode } from '../types';

const router = Router();

/**
 * Logger for request debugging
 */
const log = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.info(`[INFO] [AdsRoute] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] [AdsRoute] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] [AdsRoute] ${message}`, meta ? JSON.stringify(meta) : '');
  },
};

/**
 * Response type for ads search endpoint
 */
interface AdsSearchResponse {
  success: boolean;
  ads: Ad[];
  total: number;
  error?: string;
  /** How the brand was resolved: 'cached', 'discovered', or 'not_verified' */
  brandSource?: 'cached' | 'discovered' | 'not_verified';
  /** The verified brand name (may differ from search term) */
  verifiedBrandName?: string;
}

/**
 * GET /api/ads/search
 * Search for ads by brand name
 *
 * Query Parameters:
 * - brand (required): Brand name to search for
 * - maxAds (optional): Maximum number of ads to return (default: 10)
 * - countryCode (optional): Country code filter (e.g., "US", "GB")
 */
router.get('/search', async (req: Request, res: Response<AdsSearchResponse>) => {
  const { brand, maxAds, countryCode } = req.query;

  log.info('Ads search request received', {
    brand,
    maxAds,
    countryCode,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Validate required parameters
  if (!brand || typeof brand !== 'string' || brand.trim().length === 0) {
    log.warn('Missing or invalid brand parameter');
    return res.status(400).json({
      success: false,
      ads: [],
      total: 0,
      error: 'Brand name is required. Please provide a "brand" query parameter.',
    });
  }

  // Parse and validate optional parameters
  const parsedMaxAds = maxAds ? parseInt(String(maxAds), 10) : 10;
  if (isNaN(parsedMaxAds) || parsedMaxAds < 1 || parsedMaxAds > 100) {
    log.warn('Invalid maxAds parameter', { maxAds });
    return res.status(400).json({
      success: false,
      ads: [],
      total: 0,
      error: 'maxAds must be a number between 1 and 100.',
    });
  }

  const parsedCountryCode = countryCode && typeof countryCode === 'string'
    ? countryCode.toUpperCase().trim()
    : undefined;

  if (parsedCountryCode && !/^[A-Z]{2}$/.test(parsedCountryCode)) {
    log.warn('Invalid countryCode parameter', { countryCode });
    return res.status(400).json({
      success: false,
      ads: [],
      total: 0,
      error: 'countryCode must be a valid 2-letter ISO country code (e.g., "US", "GB").',
    });
  }

  try {
    // Initialize the GoogleAdsService
    const googleAdsService = new GoogleAdsService();

    log.info('Fetching ads from Google Ads Transparency Center', {
      brand: brand.trim(),
      maxAds: parsedMaxAds,
      countryCode: parsedCountryCode,
    });

    // Fetch ads using the service
    const result = await googleAdsService.fetchAdsByBrand(brand.trim(), {
      maxAds: parsedMaxAds,
      countryCode: parsedCountryCode,
    });

    if (!result.success) {
      log.warn('Ad fetch unsuccessful', {
        brand: brand.trim(),
        error: result.error,
        errorCode: result.errorCode,
      });

      // Determine appropriate status code based on error
      const statusCode = getStatusCodeForApifyError(result.errorCode);

      return res.status(statusCode).json({
        success: false,
        ads: [],
        total: 0,
        error: result.error || 'Failed to fetch ads. Please try again later.',
      });
    }

    log.info('Ads fetched successfully', {
      brand: brand.trim(),
      count: result.ads.length,
      totalFound: result.totalFound,
      brandSource: result.brandSource,
      verifiedBrandName: result.verifiedBrandName,
      durationMs: result.metadata?.durationMs,
    });

    return res.json({
      success: true,
      ads: result.ads,
      total: result.ads.length,
      brandSource: result.brandSource,
      verifiedBrandName: result.verifiedBrandName,
    });
  } catch (error) {
    // Handle ApifyError specifically
    if (error instanceof ApifyError) {
      log.error('ApifyError during ad fetch', {
        brand: brand.trim(),
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      });

      const statusCode = getStatusCodeForApifyError(error.code);

      return res.status(statusCode).json({
        success: false,
        ads: [],
        total: 0,
        error: getUserFriendlyErrorMessage(error.code, error.message),
      });
    }

    // Handle generic errors
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

    log.error('Unexpected error during ad fetch', {
      brand: brand.trim(),
      error: errorMessage,
    });

    return res.status(500).json({
      success: false,
      ads: [],
      total: 0,
      error: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred while fetching ads. Please try again later.'
        : errorMessage,
    });
  }
});

/**
 * Get appropriate HTTP status code for ApifyErrorCode
 */
function getStatusCodeForApifyError(errorCode?: ApifyErrorCode): number {
  switch (errorCode) {
    case ApifyErrorCode.INVALID_API_KEY:
      return 401;
    case ApifyErrorCode.RATE_LIMIT:
      return 429;
    case ApifyErrorCode.ACTOR_NOT_FOUND:
      return 404;
    case ApifyErrorCode.TIMEOUT:
      return 504;
    case ApifyErrorCode.NO_RESULTS:
      return 200; // No results is not an error
    case ApifyErrorCode.RUN_FAILED:
    case ApifyErrorCode.NETWORK_ERROR:
    case ApifyErrorCode.UNKNOWN:
    default:
      return 500;
  }
}

/**
 * Get user-friendly error message for ApifyErrorCode
 */
function getUserFriendlyErrorMessage(errorCode: ApifyErrorCode, originalMessage: string): string {
  switch (errorCode) {
    case ApifyErrorCode.INVALID_API_KEY:
      return 'Service configuration error. Please contact support.';
    case ApifyErrorCode.RATE_LIMIT:
      return 'Too many requests. Please wait a moment and try again.';
    case ApifyErrorCode.ACTOR_NOT_FOUND:
      return 'Service temporarily unavailable. Please try again later.';
    case ApifyErrorCode.TIMEOUT:
      return 'The request took too long. Please try again with a smaller maxAds value.';
    case ApifyErrorCode.NO_RESULTS:
      return 'No ads found for the specified brand.';
    case ApifyErrorCode.RUN_FAILED:
      return 'Failed to fetch ads. Please try again later.';
    case ApifyErrorCode.NETWORK_ERROR:
      return 'Network error occurred. Please check your connection and try again.';
    case ApifyErrorCode.UNKNOWN:
    default:
      return process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred. Please try again later.'
        : originalMessage;
  }
}

export default router;
