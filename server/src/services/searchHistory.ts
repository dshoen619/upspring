/**
 * Search History DynamoDB Service
 * Handles caching and retrieval of search results
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { SearchHistoryItem, CachedAd } from '../types/searchHistory';
import { Ad } from '../types';

const TABLE_NAME = 'upspring-search-history';
const REGION = 'us-east-2';

// Cache TTL: 30 days in seconds
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

// Fresh cache threshold: 24 hours in milliseconds
const FRESH_CACHE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Logger for service debugging
 */
const log = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.info(`[INFO] [SearchHistoryService] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] [SearchHistoryService] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] [SearchHistoryService] ${message}`, meta ? JSON.stringify(meta) : '');
  },
};

/**
 * Create DynamoDB client and document client
 */
const dynamoDBClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

/**
 * Convert Ad to CachedAd for storage
 */
function adToCachedAd(ad: Ad): CachedAd {
  return {
    id: ad.id,
    pageId: ad.pageId || '',
    pageName: ad.brandName,
    adArchiveId: ad.adLibraryId || ad.id,
    startDate: ad.startDate?.toISOString(),
    endDate: ad.endDate?.toISOString(),
    isActive: ad.status === 'active',
    platforms: ad.platforms,
    adCreativeBody: ad.primaryText,
    adCreativeLinkTitle: ad.headline,
    adCreativeLinkDescription: ad.description,
    adCreativeLinkCaption: ad.caption,
    images: ad.media?.filter(m => m.type === 'image').map(m => m.url) || (ad.imageUrl ? [ad.imageUrl] : []),
    videos: ad.media?.filter(m => m.type === 'video').map(m => m.url) || (ad.videoUrl ? [ad.videoUrl] : []),
    publisherPlatform: ad.platforms[0] || undefined,
    currency: ad.performanceSignals?.currency,
    spendLower: undefined, // Not available in normalized Ad
    spendUpper: undefined,
    impressionsLower: undefined,
    impressionsUpper: undefined,
  };
}

/**
 * Search History Service
 */
export class SearchHistoryService {
  /**
   * Save a new search to DynamoDB
   */
  async saveSearch(brand: string, results: Ad[]): Promise<SearchHistoryItem> {
    const searchId = randomUUID();
    const now = new Date();
    const ttl = Math.floor(now.getTime() / 1000) + CACHE_TTL_SECONDS;

    const item: SearchHistoryItem = {
      searchId,
      brand,
      normalizedBrand: brand.toLowerCase().trim(),
      searchedAt: now.toISOString(),
      resultCount: results.length,
      results: results.map(adToCachedAd),
      ttl,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        })
      );

      log.info('Search saved successfully', { searchId, brand, resultCount: results.length });
      return item;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to save search', { brand, error: errorMessage });
      throw new Error(`Failed to save search: ${errorMessage}`);
    }
  }

  /**
   * Get recent searches sorted by searchedAt
   */
  async getRecentSearches(limit: number = 20): Promise<SearchHistoryItem[]> {
    try {
      // Use Scan to get all items, then sort and limit
      // Note: For production with large datasets, consider using a GSI with a sort key
      const result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          Limit: 100, // Fetch more than needed for sorting
        })
      );

      const items = (result.Items as SearchHistoryItem[]) || [];

      // Sort by searchedAt descending and limit
      const sortedItems = items
        .sort((a, b) => new Date(b.searchedAt).getTime() - new Date(a.searchedAt).getTime())
        .slice(0, limit);

      log.info('Retrieved recent searches', { count: sortedItems.length, requestedLimit: limit });
      return sortedItems;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to get recent searches', { error: errorMessage });
      throw new Error(`Failed to get recent searches: ${errorMessage}`);
    }
  }

  /**
   * Get a specific search by ID
   */
  async getSearchById(searchId: string): Promise<SearchHistoryItem | null> {
    try {
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { searchId },
        })
      );

      if (!result.Item) {
        log.info('Search not found', { searchId });
        return null;
      }

      log.info('Retrieved search by ID', { searchId });
      return result.Item as SearchHistoryItem;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to get search by ID', { searchId, error: errorMessage });
      throw new Error(`Failed to get search: ${errorMessage}`);
    }
  }

  /**
   * Get the most recent cached result for a brand (within last 24 hours)
   */
  async getCachedSearch(brand: string): Promise<SearchHistoryItem | null> {
    const normalizedBrand = brand.toLowerCase().trim();
    const cutoffTime = new Date(Date.now() - FRESH_CACHE_THRESHOLD_MS).toISOString();

    try {
      // Scan for items with matching normalizedBrand
      // Note: For production, use a GSI on normalizedBrand with searchedAt as sort key
      const result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'normalizedBrand = :brand AND searchedAt > :cutoff',
          ExpressionAttributeValues: {
            ':brand': normalizedBrand,
            ':cutoff': cutoffTime,
          },
        })
      );

      const items = (result.Items as SearchHistoryItem[]) || [];

      if (items.length === 0) {
        log.info('No cached search found for brand', { brand, normalizedBrand });
        return null;
      }

      // Return the most recent one
      const mostRecent = items.sort(
        (a, b) => new Date(b.searchedAt).getTime() - new Date(a.searchedAt).getTime()
      )[0];

      log.info('Found cached search for brand', {
        brand,
        searchId: mostRecent.searchId,
        searchedAt: mostRecent.searchedAt,
        resultCount: mostRecent.resultCount,
      });

      return mostRecent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to get cached search', { brand, error: errorMessage });
      // Return null instead of throwing - cache miss is not a critical error
      return null;
    }
  }

  /**
   * Delete a search by ID
   */
  async deleteSearch(searchId: string): Promise<boolean> {
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { searchId },
        })
      );

      log.info('Search deleted successfully', { searchId });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to delete search', { searchId, error: errorMessage });
      throw new Error(`Failed to delete search: ${errorMessage}`);
    }
  }
}

// Export singleton instance
export const searchHistoryService = new SearchHistoryService();
