/**
 * Apify Integration Service for Meta (Facebook) Ad Library
 *
 * This service integrates with Apify's Meta Ad Library scraper to fetch
 * competitor ad data for analysis.
 */

import { ApifyClient, ActorRun } from 'apify-client';
import * as fs from 'fs';
import * as path from 'path';
import {
  Ad,
  AdPlatform,
  AdStatus,
  AdFormat,
  AdMedia,
  ApifyRawAdItem,
  ApifyError,
  ApifyErrorCode,
  FetchAdsResult,
  FetchAdsOptions,
} from '../types/ads';

/**
 * Brand cache entry
 */
interface BrandCacheEntry {
  pageId: string;
  name: string;
}

/**
 * Brands cache structure
 */
interface BrandsCache {
  brands: Record<string, BrandCacheEntry>;
  _metadata?: {
    lastUpdated: string;
    totalBrands: number;
    note: string;
  };
}

/**
 * Logger interface for consistent logging
 */
interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Default console-based logger
 */
const defaultLogger: Logger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] [MetaAdsService] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    console.info(`[INFO] [MetaAdsService] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] [MetaAdsService] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] [MetaAdsService] ${message}`, meta ? JSON.stringify(meta) : '');
  },
};

/**
 * Configuration for the MetaAdsService
 */
export interface MetaAdsServiceConfig {
  /** Apify API key (defaults to APIFY_API_KEY env var) */
  apiKey?: string;
  /** Actor ID to use for scraping */
  actorId?: string;
  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number;
  /** Default maximum ads to fetch */
  defaultMaxAds?: number;
  /** Custom logger implementation */
  logger?: Logger;
  /** Retry configuration */
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<MetaAdsServiceConfig, 'apiKey' | 'logger'>> = {
  // Use curious_coder's Facebook Ads Library scraper - well-maintained and URL-based
  actorId: 'curious_coder/facebook-ads-library-scraper',
  defaultTimeoutMs: 300000, // 5 minutes
  defaultMaxAds: 50,
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
  },
};

/**
 * Alternative actor IDs that can be used for Meta Ad Library scraping
 */
export const KNOWN_META_AD_ACTORS = {
  FACEBOOK_ADS_SCRAPER: 'apify/facebook-ads-scraper',
  META_AD_LIBRARY: 'curious_coder/meta-ad-library-scraper',
  FB_AD_LIBRARY: 'apify/facebook-ad-library-scraper',
} as const;

/**
 * MetaAdsService - Fetches and normalizes Meta (Facebook) ad data using Apify
 */
export class MetaAdsService {
  private readonly client: ApifyClient;
  private readonly config: Required<Omit<MetaAdsServiceConfig, 'apiKey' | 'logger'>> & { apiKey: string };
  private readonly logger: Logger;
  private static brandsCache: BrandsCache | null = null;

  /**
   * Creates an instance of MetaAdsService
   * @param config - Service configuration
   * @throws ApifyError if API key is not provided
   */
  constructor(config: MetaAdsServiceConfig = {}) {
    const apiKey = config.apiKey || process.env.APIFY_API_KEY;

    if (!apiKey) {
      throw new ApifyError(
        'Apify API key is required. Set APIFY_API_KEY environment variable or pass apiKey in config.',
        ApifyErrorCode.INVALID_API_KEY
      );
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      apiKey,
    };

    this.logger = config.logger || defaultLogger;
    this.client = new ApifyClient({ token: this.config.apiKey });

    this.logger.info('MetaAdsService initialized', {
      actorId: this.config.actorId,
      defaultTimeoutMs: this.config.defaultTimeoutMs,
      defaultMaxAds: this.config.defaultMaxAds,
    });
  }

  /**
   * Loads the brands cache from the JSON file
   */
  private loadBrandsCache(): BrandsCache {
    if (MetaAdsService.brandsCache) {
      return MetaAdsService.brandsCache;
    }

    try {
      const cachePath = path.join(__dirname, '../data/brands.json');
      const cacheContent = fs.readFileSync(cachePath, 'utf-8');
      MetaAdsService.brandsCache = JSON.parse(cacheContent) as BrandsCache;
      this.logger.info('Brands cache loaded', {
        brandCount: Object.keys(MetaAdsService.brandsCache.brands).length,
      });
      return MetaAdsService.brandsCache;
    } catch (error) {
      this.logger.warn('Failed to load brands cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Return empty cache if file doesn't exist
      MetaAdsService.brandsCache = { brands: {} };
      return MetaAdsService.brandsCache;
    }
  }

  /**
   * Looks up a brand in the cache by name
   */
  private lookupBrandInCache(brandName: string): BrandCacheEntry | null {
    const cache = this.loadBrandsCache();
    const normalizedName = brandName.toLowerCase().trim();
    return cache.brands[normalizedName] || null;
  }

  /**
   * Saves a discovered brand to the cache for future lookups
   */
  private saveBrandToCache(searchTerm: string, pageId: string, pageName: string): void {
    try {
      const cache = this.loadBrandsCache();
      const normalizedKey = searchTerm.toLowerCase().trim();

      // Don't overwrite existing entries
      if (cache.brands[normalizedKey]) {
        return;
      }

      // Add new entry
      cache.brands[normalizedKey] = { pageId, name: pageName };

      // Update metadata
      if (!cache._metadata) {
        cache._metadata = { lastUpdated: '', totalBrands: 0, note: '' };
      }
      cache._metadata.lastUpdated = new Date().toISOString().split('T')[0];
      cache._metadata.totalBrands = Object.keys(cache.brands).length;

      // Write back to file
      const cachePath = path.join(__dirname, '../data/brands.json');
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));

      // Update in-memory cache
      MetaAdsService.brandsCache = cache;

      this.logger.info('Brand saved to cache', {
        searchTerm: normalizedKey,
        pageId,
        pageName,
        totalBrands: cache._metadata.totalBrands,
      });
    } catch (error) {
      this.logger.warn('Failed to save brand to cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        searchTerm,
        pageId,
      });
    }
  }

  /**
   * Fetches ads by brand name from the Meta Ad Library
   *
   * @param brandName - The brand/page name to search for
   * @param options - Optional configuration for the fetch
   * @returns Promise<FetchAdsResult> with normalized ad data
   */
  async fetchAdsByBrand(brandName: string, options: FetchAdsOptions = {}): Promise<FetchAdsResult> {
    const startTime = Date.now();

    this.logger.info('Starting ad fetch for brand', { brandName, options });

    // Validate input
    if (!brandName || brandName.trim().length === 0) {
      this.logger.warn('Empty brand name provided');
      return {
        success: false,
        ads: [],
        error: 'Brand name is required',
        errorCode: ApifyErrorCode.NO_RESULTS,
        metadata: {
          query: brandName,
          durationMs: Date.now() - startTime,
        },
      };
    }

    const trimmedBrandName = brandName.trim();

    // Check if brand is in cache - if so, use page ID directly
    const cachedBrand = this.lookupBrandInCache(trimmedBrandName);
    if (cachedBrand) {
      this.logger.info('Brand found in cache, using page ID', {
        brandName: trimmedBrandName,
        pageId: cachedBrand.pageId,
        cachedName: cachedBrand.name,
      });
      const result = await this.fetchAdsByPageId(cachedBrand.pageId, options);
      return {
        ...result,
        brandSource: 'cached',
        verifiedBrandName: cachedBrand.name,
      };
    }

    this.logger.info('Brand not in cache, using search', { brandName: trimmedBrandName });

    const timeoutMs = options.timeoutMs || this.config.defaultTimeoutMs;
    const maxAds = options.maxAds || this.config.defaultMaxAds;

    try {
      // Build the actor input
      const actorInput = this.buildActorInput(trimmedBrandName, { ...options, maxAds });

      this.logger.debug('Actor input prepared', { actorInput });

      // Run the actor with retry logic
      const result = await this.runActorWithRetry(actorInput, timeoutMs);

      // Fetch the results from the dataset
      const rawAds = await this.fetchDatasetItems(result.defaultDatasetId);

      this.logger.info('Raw ads fetched from dataset', {
        count: rawAds.length,
        datasetId: result.defaultDatasetId,
      });

      // Debug: Log the first raw ad to see its structure
      if (rawAds.length > 0) {
        this.logger.debug('Sample raw ad structure', {
          keys: Object.keys(rawAds[0]),
          sample: JSON.stringify(rawAds[0], null, 2).substring(0, 2000),
        });
      }

      // Handle empty results
      if (rawAds.length === 0) {
        this.logger.warn('No ads found for brand', { brandName: trimmedBrandName });
        return {
          success: true,
          ads: [],
          totalFound: 0,
          brandSource: 'not_verified',
          metadata: {
            query: trimmedBrandName,
            durationMs: Date.now() - startTime,
            runId: result.id,
            datasetId: result.defaultDatasetId,
          },
        };
      }

      // Normalize the ads
      const normalizedAds = rawAds.map((rawAd) =>
        this.normalizeAd(rawAd, trimmedBrandName, options.includeRawData)
      );

      // Find the best matching advertiser page
      const bestMatch = this.findBestMatchingPage(normalizedAds, trimmedBrandName);

      if (!bestMatch) {
        this.logger.warn('No matching advertiser found', { searchTerm: trimmedBrandName });
        return {
          success: true,
          ads: [],
          totalFound: 0,
          brandSource: 'not_verified',
          metadata: {
            query: trimmedBrandName,
            durationMs: Date.now() - startTime,
            runId: result.id,
            datasetId: result.defaultDatasetId,
          },
        };
      }

      // Save to cache for future lookups (only if good match with exact/starts-with)
      if (bestMatch.pageId) {
        this.saveBrandToCache(trimmedBrandName, bestMatch.pageId, bestMatch.pageName);
      }

      // Filter to only include ads from the best matching page
      const filteredAds = normalizedAds.filter((ad) => ad.pageId === bestMatch.pageId);

      // Limit to the requested maxAds count
      const finalAds = filteredAds.slice(0, maxAds);

      this.logger.info('Ads normalized and filtered by best matching page', {
        rawCount: rawAds.length,
        normalizedCount: normalizedAds.length,
        bestMatchPageId: bestMatch.pageId,
        bestMatchPageName: bestMatch.pageName,
        filteredCount: filteredAds.length,
        finalCount: finalAds.length,
        searchTerm: trimmedBrandName,
      });

      return {
        success: true,
        ads: finalAds,
        totalFound: filteredAds.length,
        brandSource: 'discovered',
        verifiedBrandName: bestMatch.pageName,
        metadata: {
          query: trimmedBrandName,
          durationMs: Date.now() - startTime,
          runId: result.id,
          datasetId: result.defaultDatasetId,
        },
      };
    } catch (error) {
      return this.handleError(error, trimmedBrandName, startTime);
    }
  }

  /**
   * Fetches ads by page ID (more precise than brand name search)
   *
   * @param pageId - The Facebook page ID
   * @param options - Optional configuration for the fetch
   * @returns Promise<FetchAdsResult> with normalized ad data
   */
  async fetchAdsByPageId(pageId: string, options: FetchAdsOptions = {}): Promise<FetchAdsResult> {
    const startTime = Date.now();

    this.logger.info('Starting ad fetch for page ID', { pageId, options });

    if (!pageId || pageId.trim().length === 0) {
      this.logger.warn('Empty page ID provided');
      return {
        success: false,
        ads: [],
        error: 'Page ID is required',
        errorCode: ApifyErrorCode.NO_RESULTS,
        metadata: {
          query: pageId,
          durationMs: Date.now() - startTime,
        },
      };
    }

    const trimmedPageId = pageId.trim();
    const timeoutMs = options.timeoutMs || this.config.defaultTimeoutMs;
    const maxAds = options.maxAds || this.config.defaultMaxAds;

    try {
      // Build URL for page ID search using Meta Ad Library URL with view_all_page_id
      const activeStatus = options.activeOnly ? 'active' : 'all';
      const adLibraryUrl = `https://www.facebook.com/ads/library/?active_status=${activeStatus}&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${trimmedPageId}`;

      this.logger.debug('Using Ad Library URL with page ID', { url: adLibraryUrl });

      const actorInput: Record<string, unknown> = {
        urls: [{ url: adLibraryUrl }],
        count: maxAds,
        'scrapePageAds.activeStatus': activeStatus,
      };

      this.logger.debug('Actor input prepared for page ID fetch', { actorInput });

      const result = await this.runActorWithRetry(actorInput, timeoutMs);
      const rawAds = await this.fetchDatasetItems(result.defaultDatasetId);

      if (rawAds.length === 0) {
        this.logger.warn('No ads found for page ID', { pageId: trimmedPageId });
        return {
          success: true,
          ads: [],
          totalFound: 0,
          metadata: {
            query: trimmedPageId,
            durationMs: Date.now() - startTime,
            runId: result.id,
            datasetId: result.defaultDatasetId,
          },
        };
      }

      const normalizedAds = rawAds.map((rawAd) =>
        this.normalizeAd(rawAd, rawAd.pageName || trimmedPageId, options.includeRawData)
      );

      return {
        success: true,
        ads: normalizedAds,
        totalFound: normalizedAds.length,
        metadata: {
          query: trimmedPageId,
          durationMs: Date.now() - startTime,
          runId: result.id,
          datasetId: result.defaultDatasetId,
        },
      };
    } catch (error) {
      return this.handleError(error, trimmedPageId, startTime);
    }
  }

  /**
   * Builds the Meta Ad Library URL for searching by advertiser/page name
   */
  private buildAdLibraryUrl(brandName: string, options: FetchAdsOptions): string {
    const countryCode = options.countryCode || 'US';
    const activeStatus = options.activeOnly ? 'active' : 'all';

    // Build the Meta Ad Library search URL
    // Using search_type=page to search by advertiser name, not keyword in ad content
    const params = new URLSearchParams({
      active_status: activeStatus,
      ad_type: 'all',
      country: countryCode,
      q: brandName,
      search_type: 'page',
      media_type: 'all',
    });

    return `https://www.facebook.com/ads/library/?${params.toString()}`;
  }

  /**
   * Builds the actor input object based on search parameters
   */
  private buildActorInput(brandName: string, options: FetchAdsOptions & { maxAds: number }): Record<string, unknown> {
    const adLibraryUrl = this.buildAdLibraryUrl(brandName, options);

    // Fetch more ads than requested since we filter by advertiser name after
    // This helps ensure we get enough matching results
    const fetchCount = Math.min(options.maxAds * 4, 200);

    // curious_coder/facebook-ads-library-scraper uses 'urls' and 'count'
    const input: Record<string, unknown> = {
      urls: [{ url: adLibraryUrl }],
      count: fetchCount,
      'scrapePageAds.activeStatus': options.activeOnly ? 'active' : 'all',
    };

    return input;
  }

  /**
   * Runs the Apify actor with retry logic for transient failures
   */
  private async runActorWithRetry(
    input: Record<string, unknown>,
    timeoutMs: number,
    attempt: number = 1
  ): Promise<ActorRun> {
    const { maxRetries, baseDelayMs, maxDelayMs } = this.config.retryConfig;

    try {
      this.logger.debug('Running actor', { actorId: this.config.actorId, attempt, timeoutMs });

      const run = await this.client.actor(this.config.actorId).call(input, {
        timeout: Math.floor(timeoutMs / 1000),
        waitSecs: Math.floor(timeoutMs / 1000),
      });

      // Check if the run succeeded
      if (run.status === 'FAILED') {
        throw new ApifyError(
          `Actor run failed with status: ${run.status}`,
          ApifyErrorCode.RUN_FAILED,
          undefined,
          { runId: run.id, status: run.status }
        );
      }

      if (run.status === 'TIMED-OUT') {
        throw new ApifyError(
          'Actor run timed out',
          ApifyErrorCode.TIMEOUT,
          undefined,
          { runId: run.id, timeoutMs }
        );
      }

      this.logger.info('Actor run completed', {
        runId: run.id,
        status: run.status,
        datasetId: run.defaultDatasetId,
      });

      return run;
    } catch (error) {
      const isRetryable = this.isRetryableError(error);
      const isRateLimitError = this.isRateLimitError(error);

      this.logger.warn('Actor run failed', {
        attempt,
        maxRetries,
        isRetryable,
        isRateLimitError,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (attempt >= maxRetries || (!isRetryable && !isRateLimitError)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);

      // Add extra delay for rate limits
      const actualDelay = isRateLimitError ? delay * 2 : delay;

      this.logger.info('Retrying after delay', { delay: actualDelay, attempt: attempt + 1 });

      await this.sleep(actualDelay);

      return this.runActorWithRetry(input, timeoutMs, attempt + 1);
    }
  }

  /**
   * Fetches items from an Apify dataset
   */
  private async fetchDatasetItems(datasetId: string): Promise<ApifyRawAdItem[]> {
    try {
      this.logger.debug('Fetching dataset items', { datasetId });

      const dataset = this.client.dataset(datasetId);
      const { items } = await dataset.listItems();

      return items as ApifyRawAdItem[];
    } catch (error) {
      this.logger.error('Failed to fetch dataset items', {
        datasetId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ApifyError(
        'Failed to fetch results from dataset',
        ApifyErrorCode.NETWORK_ERROR,
        undefined,
        { datasetId }
      );
    }
  }

  /**
   * Normalizes a raw ad item from Apify to our standard Ad format
   * Handles both camelCase and snake_case field names, plus nested snapshot structures
   */
  private normalizeAd(rawAd: ApifyRawAdItem, brandName: string, includeRawData?: boolean): Ad {
    // Type assertion for snake_case fields from some Apify actors
    const raw = rawAd as ApifyRawAdItem & {
      ad_archive_id?: string;
      page_id?: string;
      page_name?: string;
      start_date?: string;
      end_date?: string;
      start_date_formatted?: string;
      end_date_formatted?: string;
      publisher_platform?: string[];
      ad_library_url?: string;
      is_active?: boolean;
      snapshot?: {
        page_profile_picture_url?: string;
        page_name?: string;
        body?: { text?: string };
        cta_text?: string;
        cta_type?: string;
        caption?: string;
        cards?: Array<{ resized_image_url?: string; video_preview_image_url?: string; video_hd_url?: string }>;
        images?: Array<{ resized_image_url?: string; original_image_url?: string }>;
        videos?: Array<{ video_hd_url?: string; video_sd_url?: string; video_preview_image_url?: string }>;
      };
    };

    // Extract the ad ID from various possible fields (camelCase and snake_case)
    const id = raw.id || raw.adArchiveID || raw.ad_archive_id || raw.adid || this.generateAdId(rawAd);

    // Parse platforms
    const platforms = this.parsePlatforms(rawAd);

    // Parse status
    const status = this.parseStatus(rawAd);

    // Parse dates (check both camelCase and snake_case, plus formatted versions)
    const startDate = this.parseDate(
      raw.startDate || raw.start_date || raw.start_date_formatted || raw.adCreationTime || raw.adDeliveryStartTime
    );
    const endDate = this.parseDate(
      raw.endDate || raw.end_date || raw.end_date_formatted || raw.adDeliveryStopTime
    );

    // Parse media (including from snapshot)
    const media = this.parseMedia(rawAd);

    // Determine format
    const format = this.determineFormat(rawAd, media);

    // Extract image URL from various sources including snapshot
    const imageUrl = this.extractImageUrl(raw);
    const videoUrl = this.extractVideoUrl(raw);

    // Extract text content from snapshot.body.text if available
    const primaryText = raw.primaryText || raw.bodyText || raw.adText || raw.snapshot?.body?.text;

    // Extract CTA from snapshot if available
    const ctaText = raw.ctaText || raw.snapshot?.cta_text;
    const ctaType = raw.ctaType || raw.snapshot?.cta_type;

    // Build normalized ad object
    const ad: Ad = {
      id,
      adLibraryId: raw.adArchiveID || raw.ad_archive_id,
      brandName: raw.pageName || raw.page_name || raw.snapshot?.page_name || brandName,
      pageId: raw.pageID || raw.page_id,
      pageUrl: raw.pageUrl,
      headline: raw.headline || raw.linkTitle,
      primaryText,
      description: raw.linkDescription,
      caption: raw.linkCaption || raw.snapshot?.caption,
      callToAction: ctaText
        ? {
            text: ctaText,
            type: ctaType,
            linkUrl: raw.linkUrl,
          }
        : undefined,
      imageUrl,
      videoUrl,
      media,
      platforms,
      format,
      startDate,
      endDate,
      status,
      performanceSignals: this.parsePerformanceSignals(rawAd),
      demographics: this.parseDemographics(rawAd),
      categories: raw.categories || (raw.category ? [raw.category] : undefined),
      adLibraryUrl: raw.adLibraryUrl || raw.ad_library_url,
      snapshotUrl: raw.adSnapshotUrl,
      fetchedAt: new Date(),
    };

    // Optionally include raw data for debugging
    if (includeRawData) {
      ad.rawData = rawAd;
    }

    return ad;
  }

  /**
   * Extracts image URL from various possible locations in the raw ad data
   */
  private extractImageUrl(raw: ApifyRawAdItem & { snapshot?: { page_profile_picture_url?: string; images?: Array<{ resized_image_url?: string; original_image_url?: string }>; cards?: Array<{ resized_image_url?: string; video_preview_image_url?: string }> } }): string | undefined {
    // Direct image URL
    if (raw.imageUrl) return raw.imageUrl;

    // From images array
    if (raw.images?.[0]) return raw.images[0];

    // From snapshot.images array
    if (raw.snapshot?.images?.[0]) {
      return raw.snapshot.images[0].resized_image_url || raw.snapshot.images[0].original_image_url;
    }

    // From snapshot.cards (carousel ads)
    if (raw.snapshot?.cards?.[0]) {
      return raw.snapshot.cards[0].resized_image_url || raw.snapshot.cards[0].video_preview_image_url;
    }

    // Fallback to page profile picture if no ad image
    if (raw.snapshot?.page_profile_picture_url) {
      return raw.snapshot.page_profile_picture_url;
    }

    return undefined;
  }

  /**
   * Extracts video URL from various possible locations in the raw ad data
   */
  private extractVideoUrl(raw: ApifyRawAdItem & { snapshot?: { videos?: Array<{ video_hd_url?: string; video_sd_url?: string }>; cards?: Array<{ video_hd_url?: string }> } }): string | undefined {
    // Direct video URL
    if (raw.videoUrl) return raw.videoUrl;

    // From videos array
    if (raw.videos?.[0]?.url) return raw.videos[0].url;

    // From snapshot.videos array
    if (raw.snapshot?.videos?.[0]) {
      return raw.snapshot.videos[0].video_hd_url || raw.snapshot.videos[0].video_sd_url;
    }

    // From snapshot.cards (carousel with videos)
    if (raw.snapshot?.cards?.[0]?.video_hd_url) {
      return raw.snapshot.cards[0].video_hd_url;
    }

    return undefined;
  }

  /**
   * Parses platforms from raw ad data
   * Handles both camelCase and snake_case field names
   */
  private parsePlatforms(rawAd: ApifyRawAdItem): AdPlatform[] {
    // Type assertion for snake_case field
    const raw = rawAd as ApifyRawAdItem & { publisher_platform?: string[] };

    const platformStrings = rawAd.platforms || rawAd.publisherPlatform || raw.publisher_platform || [];

    if (!Array.isArray(platformStrings) || platformStrings.length === 0) {
      return ['unknown'];
    }

    return platformStrings.map((p) => {
      const platform = String(p).toLowerCase();
      if (platform.includes('facebook')) return 'facebook';
      if (platform.includes('instagram')) return 'instagram';
      if (platform.includes('messenger')) return 'messenger';
      if (platform.includes('audience_network') || platform.includes('audience network')) {
        return 'audience_network';
      }
      return 'unknown';
    });
  }

  /**
   * Parses ad status from raw data
   * Handles both camelCase (isActive) and snake_case (is_active) field names
   */
  private parseStatus(rawAd: ApifyRawAdItem): AdStatus {
    // Type assertion for snake_case fields
    const raw = rawAd as ApifyRawAdItem & { is_active?: boolean };

    // Check camelCase fields first
    if (rawAd.isActive === true || rawAd.isRunning === true) {
      return 'active';
    }
    if (rawAd.isActive === false || rawAd.isRunning === false) {
      return 'inactive';
    }

    // Check snake_case field
    if (raw.is_active === true) {
      return 'active';
    }
    if (raw.is_active === false) {
      return 'inactive';
    }

    // Check string status field
    if (rawAd.status) {
      const status = String(rawAd.status).toLowerCase();
      if (status === 'active' || status === 'running') return 'active';
      if (status === 'inactive' || status === 'stopped' || status === 'paused') return 'inactive';
      if (status === 'removed' || status === 'deleted') return 'removed';
    }
    return 'unknown';
  }

  /**
   * Finds the best matching advertiser page from normalized ads
   * Prioritizes: exact match > starts with > contains
   * ONLY returns a match if there's actual name similarity
   */
  private findBestMatchingPage(
    ads: Ad[],
    searchTerm: string
  ): { pageId: string; pageName: string } | null {
    // Group ads by pageId
    const pageMap = new Map<string, { pageName: string; count: number }>();

    for (const ad of ads) {
      if (!ad.pageId) continue;

      const existing = pageMap.get(ad.pageId);
      if (existing) {
        existing.count++;
      } else {
        pageMap.set(ad.pageId, { pageName: ad.brandName || '', count: 1 });
      }
    }

    if (pageMap.size === 0) return null;

    const searchLower = searchTerm.toLowerCase();
    let bestMatch: { pageId: string; pageName: string; score: number; count: number } | null = null;

    for (const [pageId, { pageName, count }] of pageMap) {
      const nameLower = pageName.toLowerCase();

      // Calculate match score - ONLY based on name similarity
      let nameScore = 0;

      if (nameLower === searchLower) {
        // Exact match - highest priority
        nameScore = 1000;
      } else if (nameLower.startsWith(searchLower) || searchLower.startsWith(nameLower)) {
        // Starts with - second priority
        nameScore = 500;
      } else if (nameLower.includes(searchLower) || searchLower.includes(nameLower)) {
        // Contains - lower priority
        nameScore = 100;
      }

      // ONLY consider this page if there's actual name relevance
      if (nameScore === 0) {
        continue; // Skip pages with no name match
      }

      // Add bonus for ad count only if there's name relevance
      const totalScore = nameScore + Math.min(count, 50);

      if (!bestMatch || totalScore > bestMatch.score) {
        bestMatch = { pageId, pageName, score: totalScore, count };
      }
    }

    if (bestMatch) {
      this.logger.debug('Best matching page found', {
        pageId: bestMatch.pageId,
        pageName: bestMatch.pageName,
        score: bestMatch.score,
        adCount: bestMatch.count,
      });
      return { pageId: bestMatch.pageId, pageName: bestMatch.pageName };
    }

    this.logger.warn('No matching page found with name similarity', { searchTerm });
    return null;
  }

  /**
   * Parses a date from various formats
   */
  private parseDate(dateValue: string | undefined): Date | undefined {
    if (!dateValue) return undefined;

    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return undefined;
      return date;
    } catch {
      return undefined;
    }
  }

  /**
   * Parses media assets from raw ad data
   * Handles nested snapshot structures from some Apify actors
   */
  private parseMedia(rawAd: ApifyRawAdItem): AdMedia[] {
    const media: AdMedia[] = [];

    // Type assertion for snapshot structure
    const raw = rawAd as ApifyRawAdItem & {
      snapshot?: {
        images?: Array<{ resized_image_url?: string; original_image_url?: string }>;
        videos?: Array<{ video_hd_url?: string; video_sd_url?: string; video_preview_image_url?: string }>;
        cards?: Array<{ resized_image_url?: string; video_preview_image_url?: string; video_hd_url?: string }>;
      };
    };

    // Parse direct images
    if (rawAd.imageUrl) {
      media.push({ type: 'image', url: rawAd.imageUrl });
    }
    if (rawAd.images && Array.isArray(rawAd.images)) {
      rawAd.images.forEach((url) => {
        if (url && !media.some((m) => m.url === url)) {
          media.push({ type: 'image', url });
        }
      });
    }

    // Parse snapshot.images
    if (raw.snapshot?.images && Array.isArray(raw.snapshot.images)) {
      raw.snapshot.images.forEach((img) => {
        const url = img.resized_image_url || img.original_image_url;
        if (url && !media.some((m) => m.url === url)) {
          media.push({ type: 'image', url });
        }
      });
    }

    // Parse snapshot.cards (carousel ads)
    if (raw.snapshot?.cards && Array.isArray(raw.snapshot.cards)) {
      raw.snapshot.cards.forEach((card) => {
        // Card image
        const imgUrl = card.resized_image_url || card.video_preview_image_url;
        if (imgUrl && !media.some((m) => m.url === imgUrl)) {
          media.push({ type: 'image', url: imgUrl });
        }
        // Card video
        if (card.video_hd_url && !media.some((m) => m.url === card.video_hd_url)) {
          media.push({ type: 'video', url: card.video_hd_url, thumbnailUrl: card.video_preview_image_url });
        }
      });
    }

    // Parse direct videos
    if (rawAd.videoUrl) {
      media.push({ type: 'video', url: rawAd.videoUrl });
    }
    if (rawAd.videos && Array.isArray(rawAd.videos)) {
      rawAd.videos.forEach((video) => {
        if (video.url && !media.some((m) => m.url === video.url)) {
          media.push({
            type: 'video',
            url: video.url,
            thumbnailUrl: video.thumbnailUrl,
            duration: video.duration,
          });
        }
      });
    }

    // Parse snapshot.videos
    if (raw.snapshot?.videos && Array.isArray(raw.snapshot.videos)) {
      raw.snapshot.videos.forEach((video) => {
        const url = video.video_hd_url || video.video_sd_url;
        if (url && !media.some((m) => m.url === url)) {
          media.push({
            type: 'video',
            url,
            thumbnailUrl: video.video_preview_image_url,
          });
        }
      });
    }

    // Parse generic media array
    if (rawAd.media && Array.isArray(rawAd.media)) {
      rawAd.media.forEach((item) => {
        if (item.url && !media.some((m) => m.url === item.url)) {
          media.push({
            type: item.type === 'video' ? 'video' : 'image',
            url: item.url,
            thumbnailUrl: item.thumbnailUrl,
          });
        }
      });
    }

    return media;
  }

  /**
   * Determines the ad format based on media and content
   */
  private determineFormat(rawAd: ApifyRawAdItem, media: AdMedia[]): AdFormat {
    const videoCount = media.filter((m) => m.type === 'video').length;
    const imageCount = media.filter((m) => m.type === 'image').length;

    if (videoCount > 0) return 'video';
    if (imageCount > 1) return 'carousel';
    if (imageCount === 1) return 'image';

    // Check raw data for format hints
    if (rawAd.videoUrl || (rawAd.videos && rawAd.videos.length > 0)) return 'video';
    if (rawAd.images && rawAd.images.length > 1) return 'carousel';
    if (rawAd.imageUrl || (rawAd.images && rawAd.images.length === 1)) return 'image';

    return 'unknown';
  }

  /**
   * Parses performance signals from raw ad data
   */
  private parsePerformanceSignals(rawAd: ApifyRawAdItem): Ad['performanceSignals'] | undefined {
    const signals: Ad['performanceSignals'] = {};
    let hasSignals = false;

    if (rawAd.spend) {
      if (rawAd.spend.lowerBound !== undefined || rawAd.spend.upperBound !== undefined) {
        signals.spendEstimate = this.formatRange(rawAd.spend.lowerBound, rawAd.spend.upperBound);
        signals.currency = rawAd.spend.currency || 'USD';
        hasSignals = true;
      }
    }

    if (rawAd.impressions) {
      if (rawAd.impressions.lowerBound !== undefined || rawAd.impressions.upperBound !== undefined) {
        signals.impressionsEstimate = this.formatRange(rawAd.impressions.lowerBound, rawAd.impressions.upperBound);
        hasSignals = true;
      }
    }

    if (rawAd.reach) {
      if (rawAd.reach.lowerBound !== undefined || rawAd.reach.upperBound !== undefined) {
        signals.reachEstimate = this.formatRange(rawAd.reach.lowerBound, rawAd.reach.upperBound);
        hasSignals = true;
      }
    }

    return hasSignals ? signals : undefined;
  }

  /**
   * Parses demographic targeting from raw ad data
   */
  private parseDemographics(rawAd: ApifyRawAdItem): Ad['demographics'] | undefined {
    const demographics: Ad['demographics'] = {};
    let hasDemographics = false;

    if (rawAd.demographicDistribution && rawAd.demographicDistribution.length > 0) {
      // Extract age ranges
      const ageRanges = rawAd.demographicDistribution
        .filter((d) => d.ageRange)
        .map((d) => d.ageRange)
        .filter((v, i, a) => a.indexOf(v) === i);

      if (ageRanges.length > 0) {
        demographics.ageRange = ageRanges.join(', ');
        hasDemographics = true;
      }

      // Determine gender targeting
      const genders = rawAd.demographicDistribution
        .filter((d) => d.gender)
        .map((d) => d.gender?.toLowerCase());

      if (genders.length > 0) {
        if (genders.includes('male') && genders.includes('female')) {
          demographics.gender = 'all';
        } else if (genders.includes('male')) {
          demographics.gender = 'male';
        } else if (genders.includes('female')) {
          demographics.gender = 'female';
        }
        hasDemographics = true;
      }
    }

    if (rawAd.regionDistribution && rawAd.regionDistribution.length > 0) {
      demographics.regions = rawAd.regionDistribution
        .filter((r) => r.region)
        .map((r) => r.region as string);
      hasDemographics = true;
    }

    return hasDemographics ? demographics : undefined;
  }

  /**
   * Formats a numeric range as a string
   */
  private formatRange(lower?: number, upper?: number): string {
    if (lower !== undefined && upper !== undefined) {
      return `${this.formatNumber(lower)}-${this.formatNumber(upper)}`;
    }
    if (lower !== undefined) {
      return `${this.formatNumber(lower)}+`;
    }
    if (upper !== undefined) {
      return `<${this.formatNumber(upper)}`;
    }
    return 'Unknown';
  }

  /**
   * Formats a number with K/M suffixes
   */
  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return String(num);
  }

  /**
   * Generates a unique ID for an ad if none exists
   */
  private generateAdId(rawAd: ApifyRawAdItem): string {
    const components = [
      rawAd.pageID || '',
      rawAd.adText?.substring(0, 50) || '',
      rawAd.imageUrl || rawAd.videoUrl || '',
      rawAd.startDate || '',
    ];
    return this.hashString(components.join('|'));
  }

  /**
   * Simple string hashing function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `generated_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Checks if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof ApifyError) {
      return [ApifyErrorCode.NETWORK_ERROR, ApifyErrorCode.TIMEOUT].includes(error.code);
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('enotfound') ||
        message.includes('socket')
      );
    }

    return false;
  }

  /**
   * Checks if an error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof ApifyError) {
      return error.code === ApifyErrorCode.RATE_LIMIT;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('429')
      );
    }

    return false;
  }

  /**
   * Handles errors and returns a FetchAdsResult
   */
  private handleError(error: unknown, query: string, startTime: number): FetchAdsResult {
    let errorMessage: string;
    let errorCode: ApifyErrorCode;

    if (error instanceof ApifyError) {
      errorMessage = error.message;
      errorCode = error.code;
    } else if (error instanceof Error) {
      errorMessage = error.message;

      // Detect error type from message
      const lowerMessage = error.message.toLowerCase();
      if (
        (lowerMessage.includes('out of') && lowerMessage.includes('token')) ||
        lowerMessage.includes('credit') ||
        lowerMessage.includes('usage limit') ||
        lowerMessage.includes('quota') ||
        (lowerMessage.includes('insufficient') && (lowerMessage.includes('credit') || lowerMessage.includes('token'))) ||
        (lowerMessage.includes('exceeded') && (lowerMessage.includes('limit') || lowerMessage.includes('quota')))
      ) {
        errorCode = ApifyErrorCode.USAGE_QUOTA_EXCEEDED;
      } else if (lowerMessage.includes('timeout')) {
        errorCode = ApifyErrorCode.TIMEOUT;
      } else if (lowerMessage.includes('rate limit') || lowerMessage.includes('429')) {
        errorCode = ApifyErrorCode.RATE_LIMIT;
      } else if (lowerMessage.includes('not found') || lowerMessage.includes('404')) {
        errorCode = ApifyErrorCode.ACTOR_NOT_FOUND;
      } else if (lowerMessage.includes('unauthorized') || lowerMessage.includes('401')) {
        errorCode = ApifyErrorCode.INVALID_API_KEY;
      } else {
        errorCode = ApifyErrorCode.UNKNOWN;
      }
    } else {
      errorMessage = 'An unknown error occurred';
      errorCode = ApifyErrorCode.UNKNOWN;
    }

    this.logger.error('Error fetching ads', {
      error: errorMessage,
      errorCode,
      query,
      durationMs: Date.now() - startTime,
    });

    return {
      success: false,
      ads: [],
      error: errorMessage,
      errorCode,
      metadata: {
        query,
        durationMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Updates the actor ID to use a different scraper
   */
  setActorId(actorId: string): void {
    (this.config as { actorId: string }).actorId = actorId;
    this.logger.info('Actor ID updated', { actorId });
  }

  /**
   * Gets the current actor ID
   */
  getActorId(): string {
    return this.config.actorId;
  }
}

// Export a factory function for convenience
export function createMetaAdsService(config?: MetaAdsServiceConfig): MetaAdsService {
  return new MetaAdsService(config);
}

// Export default instance creator
export default MetaAdsService;
