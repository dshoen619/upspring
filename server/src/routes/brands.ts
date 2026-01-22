/**
 * Brands API Routes
 * Endpoints for retrieving brand information from the local cache
 */

import { Router, Request, Response } from 'express';
import { readFile } from 'fs/promises';
import { join } from 'path';

const router = Router();

/**
 * Type definition for an advertiser entry in the cache
 */
interface AdvertiserEntry {
  advertiserId: string;
  name: string;
  domain?: string;
}

/**
 * Type definition for the brands cache file structure
 */
interface BrandsCache {
  advertisers: Record<string, AdvertiserEntry>;
  _metadata?: {
    lastUpdated: string;
    totalAdvertisers: number;
    note?: string;
  };
}

/**
 * Response type for brands list endpoint
 */
interface BrandsListResponse {
  success: boolean;
  brands: string[];
  error?: string;
}

/**
 * Path to the brands cache file
 */
const BRANDS_CACHE_PATH = join(__dirname, '..', 'data', 'brands.json');

/**
 * GET /api/brands
 * Returns a sorted list of all brand names from the brands cache
 */
router.get('/', async (_req: Request, res: Response<BrandsListResponse>) => {
  try {
    // Read the brands cache file
    const fileContent = await readFile(BRANDS_CACHE_PATH, 'utf-8');
    const brandsCache: BrandsCache = JSON.parse(fileContent);

    // Extract brand names from the cache and sort alphabetically (case-insensitive)
    const brandNames = Object.values(brandsCache.advertisers || {})
      .map((advertiser) => advertiser.name)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    return res.json({
      success: true,
      brands: brandNames,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    console.error('[ERROR] [BrandsRoute] Failed to load brands cache:', errorMessage);

    // Determine if it's a file not found error
    const isFileNotFound = error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT';

    return res.status(isFileNotFound ? 404 : 500).json({
      success: false,
      brands: [],
      error: process.env.NODE_ENV === 'production'
        ? 'Failed to load brands. Please try again later.'
        : errorMessage,
    });
  }
});

export default router;
