/**
 * TypeScript interfaces for Search History and DynamoDB caching
 */

/**
 * Cached ad data stored in DynamoDB
 * Simplified version of Ad for storage efficiency
 */
export interface CachedAd {
  id: string;
  pageId: string;
  pageName: string;
  adArchiveId: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  platforms: string[];
  adCreativeBody?: string;
  adCreativeLinkTitle?: string;
  adCreativeLinkDescription?: string;
  adCreativeLinkCaption?: string;
  images: string[];
  videos: string[];
  publisherPlatform?: string;
  currency?: string;
  spendLower?: number;
  spendUpper?: number;
  impressionsLower?: number;
  impressionsUpper?: number;
}

/**
 * Search history item stored in DynamoDB
 */
export interface SearchHistoryItem {
  searchId: string;
  brand: string;
  normalizedBrand: string; // lowercase for querying
  searchedAt: string; // ISO timestamp
  resultCount: number;
  results: CachedAd[]; // cached ad results
  ttl?: number; // Unix timestamp for auto-expiration
}

/**
 * Response for getting search history list
 */
export interface SearchHistoryResponse {
  success: boolean;
  history?: SearchHistoryItem[];
  error?: string;
}

/**
 * Response for getting a single cached search
 */
export interface CachedSearchResponse {
  success: boolean;
  item?: SearchHistoryItem;
  error?: string;
}
