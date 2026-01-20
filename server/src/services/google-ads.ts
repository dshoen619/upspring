/**
 * Google Ads Transparency Center Integration Service
 *
 * This service integrates with Apify's Google Ads Transparency scraper to fetch
 * advertiser ad data for analysis. Uses domain-based search for accuracy.
 */

import { ApifyClient } from 'apify-client';
import * as fs from 'fs';
import * as path from 'path';
import {
  Ad,
  AdPlatform,
  AdStatus,
  AdFormat,
  AdMedia,
  ApifyError,
  ApifyErrorCode,
  FetchAdsResult,
  FetchAdsOptions,
} from '../types/ads';

/**
 * Advertiser cache entry
 */
interface AdvertiserCacheEntry {
  advertiserId: string;
  name: string;
  domain: string;
}

/**
 * Advertisers cache structure
 */
interface AdvertisersCache {
  advertisers: Record<string, AdvertiserCacheEntry>;
  _metadata?: {
    lastUpdated: string;
    totalAdvertisers: number;
    note: string;
  };
}

/**
 * Raw ad item from Google Ads Transparency scraper
 */
interface GoogleAdRawItem {
  advertiserId?: string;
  advertiserName?: string;
  creativeId?: string;
  adType?: string; // "Text", "Image", "Video"
  variations?: Array<{
    textAdMetadata?: {
      iframeUrl?: string; // Contains HTML img tag
    };
    imageAdMetadata?: {
      imageUrl?: string;
    };
    videoAdMetadata?: {
      videoUrl?: string;
      thumbnailUrl?: string;
    };
  }>;
  targeting?: {
    demographics?: { included: boolean; excluded: boolean };
    locations?: { included: boolean; excluded: boolean };
  };
  stats?: {
    dateRange?: {
      startDate?: string;
      endDate?: string;
    };
    impressions?: {
      total?: { min: string; max: string };
      byRegion?: Array<{
        regionName?: string;
        byPlatform?: string[];
      }>;
    };
  };
}

/**
 * Logger interface
 */
interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

const defaultLogger: Logger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] [GoogleAdsService] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    console.info(`[INFO] [GoogleAdsService] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] [GoogleAdsService] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] [GoogleAdsService] ${message}`, meta ? JSON.stringify(meta) : '');
  },
};

/**
 * Configuration for the GoogleAdsService
 */
export interface GoogleAdsServiceConfig {
  apiKey?: string;
  actorId?: string;
  defaultTimeoutMs?: number;
  defaultMaxAds?: number;
  logger?: Logger;
}

const DEFAULT_CONFIG = {
  actorId: 'xtech/google-ad-transparency-scraper',
  defaultTimeoutMs: 180000, // 3 minutes
  defaultMaxAds: 10,
};

const CACHE_FILE = path.join(__dirname, '../data/brands.json');

/**
 * Google Ads Transparency Service
 */
export class GoogleAdsService {
  private client: ApifyClient;
  private config: Required<Omit<GoogleAdsServiceConfig, 'apiKey' | 'logger'>>;
  private logger: Logger;
  private static advertisersCache: AdvertisersCache | null = null;

  constructor(config?: GoogleAdsServiceConfig) {
    const apiKey = config?.apiKey || process.env.APIFY_API_KEY;

    if (!apiKey) {
      throw new ApifyError(
        'APIFY_API_KEY is required',
        ApifyErrorCode.INVALID_API_KEY
      );
    }

    this.client = new ApifyClient({ token: apiKey });
    this.config = {
      actorId: config?.actorId || DEFAULT_CONFIG.actorId,
      defaultTimeoutMs: config?.defaultTimeoutMs || DEFAULT_CONFIG.defaultTimeoutMs,
      defaultMaxAds: config?.defaultMaxAds || DEFAULT_CONFIG.defaultMaxAds,
    };
    this.logger = config?.logger || defaultLogger;

    // Load cache on instantiation
    this.loadCache();
  }

  /**
   * Load advertisers cache from file
   */
  private loadCache(): void {
    if (GoogleAdsService.advertisersCache) return;

    try {
      const content = fs.readFileSync(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      // Convert old format to new format if needed
      GoogleAdsService.advertisersCache = {
        advertisers: parsed.brands || parsed.advertisers || {},
        _metadata: parsed._metadata,
      };
      this.logger.info('Advertisers cache loaded', {
        count: Object.keys(GoogleAdsService.advertisersCache.advertisers).length,
      });
    } catch {
      GoogleAdsService.advertisersCache = { advertisers: {} };
      this.logger.info('No cache file found, starting fresh');
    }
  }

  /**
   * Save cache to file
   */
  private saveCache(): void {
    if (!GoogleAdsService.advertisersCache) return;

    try {
      GoogleAdsService.advertisersCache._metadata = {
        lastUpdated: new Date().toISOString().split('T')[0],
        totalAdvertisers: Object.keys(GoogleAdsService.advertisersCache.advertisers).length,
        note: 'Google Ads advertiser IDs cached for faster lookups',
      };
      fs.writeFileSync(
        CACHE_FILE,
        JSON.stringify(GoogleAdsService.advertisersCache, null, 2)
      );
      this.logger.info('Cache saved', {
        count: GoogleAdsService.advertisersCache._metadata.totalAdvertisers,
      });
    } catch (error) {
      this.logger.error('Failed to save cache', { error: String(error) });
    }
  }

  /**
   * Lookup advertiser in cache
   */
  private lookupInCache(brandName: string): AdvertiserCacheEntry | null {
    const key = brandName.toLowerCase().trim();
    return GoogleAdsService.advertisersCache?.advertisers[key] || null;
  }

  /**
   * Save advertiser to cache
   */
  private saveToCache(brandName: string, advertiserId: string, displayName: string, domain: string): void {
    if (!GoogleAdsService.advertisersCache) {
      GoogleAdsService.advertisersCache = { advertisers: {} };
    }

    const key = brandName.toLowerCase().trim();
    GoogleAdsService.advertisersCache.advertisers[key] = {
      advertiserId,
      name: displayName,
      domain,
    };
    this.saveCache();
    this.logger.info('Advertiser cached', { brandName, advertiserId, displayName, domain });
  }

  /**
   * Build domain from brand name
   */
  private buildDomain(brandName: string): string {
    // Common brand to domain mappings
    const domainMap: Record<string, string> = {
      'coca-cola': 'coca-cola.com',
      'coca cola': 'coca-cola.com',
      'mcdonald\'s': 'mcdonalds.com',
      'mcdonalds': 'mcdonalds.com',
      'at&t': 'att.com',
      'att': 'att.com',
    };

    const key = brandName.toLowerCase().trim();
    if (domainMap[key]) {
      return domainMap[key];
    }

    // Default: remove spaces and special chars, add .com
    const cleanName = brandName.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
    return `${cleanName}.com`;
  }

  /**
   * Build Google Ads Transparency URL for domain search
   */
  private buildSearchUrl(domain: string, region: string = 'US'): string {
    return `https://adstransparency.google.com/?region=${region}&domain=${domain}`;
  }

  /**
   * Fetch ads by brand name
   */
  async fetchAdsByBrand(brandName: string, options: FetchAdsOptions = {}): Promise<FetchAdsResult> {
    const startTime = Date.now();

    this.logger.info('Starting ad fetch for brand', { brandName, options });

    if (!brandName || brandName.trim().length === 0) {
      return {
        success: false,
        ads: [],
        error: 'Brand name is required',
        errorCode: ApifyErrorCode.NO_RESULTS,
        brandSource: 'not_verified',
        metadata: { query: brandName, durationMs: Date.now() - startTime },
      };
    }

    const trimmedBrandName = brandName.trim();

    // Check cache first
    const cached = this.lookupInCache(trimmedBrandName);
    if (cached) {
      this.logger.info('Advertiser found in cache', {
        brandName: trimmedBrandName,
        advertiserId: cached.advertiserId,
        cachedName: cached.name,
      });
      const result = await this.fetchAdsByAdvertiserId(cached.advertiserId, options);
      return {
        ...result,
        brandSource: 'cached',
        verifiedBrandName: cached.name,
      };
    }

    // Not in cache - search by domain
    this.logger.info('Advertiser not in cache, searching by domain', { brandName: trimmedBrandName });

    const domain = this.buildDomain(trimmedBrandName);
    const searchUrl = this.buildSearchUrl(domain, options.countryCode || 'US');

    this.logger.info('Searching Google Ads Transparency', { domain, searchUrl });

    try {
      const maxAds = options.maxAds || this.config.defaultMaxAds;
      // searchInputs accepts domain names, advertiser IDs (AR format), or search terms
      const actorInput = {
        searchInputs: [domain],
        maxPagesPerInput: 1, // Only fetch first page
        maxItems: maxAds, // Limit total items fetched
      };

      const run = await this.client.actor(this.config.actorId).call(actorInput, {
        timeout: Math.floor(this.config.defaultTimeoutMs / 1000),
        waitSecs: Math.floor(this.config.defaultTimeoutMs / 1000),
      });

      if (run.status !== 'SUCCEEDED') {
        this.logger.warn('Actor run failed', { status: run.status });
        return {
          success: false,
          ads: [],
          error: 'Failed to fetch ads',
          errorCode: ApifyErrorCode.RUN_FAILED,
          brandSource: 'not_verified',
          metadata: { query: trimmedBrandName, durationMs: Date.now() - startTime },
        };
      }

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      this.logger.info('Raw ads fetched', { count: items.length });

      // Log first raw item to see structure
      if (items.length > 0) {
        this.logger.info('Sample raw ad data', { sample: JSON.stringify(items[0], null, 2) });
      }

      if (items.length === 0) {
        return {
          success: true,
          ads: [],
          totalFound: 0,
          brandSource: 'not_verified',
          metadata: {
            query: trimmedBrandName,
            durationMs: Date.now() - startTime,
            runId: run.id,
          },
        };
      }

      // Normalize ads
      const normalizedAds = items.map((item) =>
        this.normalizeAd(item as GoogleAdRawItem, trimmedBrandName)
      );

      // Find the advertiser info from the first ad
      const firstAd = items[0] as GoogleAdRawItem;
      const advertiserId = firstAd.advertiserId;
      const advertiserName = firstAd.advertiserName || trimmedBrandName;

      // Cache the advertiser if we found a valid ID
      if (advertiserId) {
        this.saveToCache(trimmedBrandName, advertiserId, advertiserName, domain);
      }

      const finalAds = normalizedAds.slice(0, maxAds);

      return {
        success: true,
        ads: finalAds,
        totalFound: normalizedAds.length,
        brandSource: advertiserId ? 'discovered' : 'not_verified',
        verifiedBrandName: advertiserName,
        metadata: {
          query: trimmedBrandName,
          durationMs: Date.now() - startTime,
          runId: run.id,
          datasetId: run.defaultDatasetId,
        },
      };
    } catch (error) {
      this.logger.error('Error fetching ads', { error: String(error) });
      return {
        success: false,
        ads: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: ApifyErrorCode.UNKNOWN,
        brandSource: 'not_verified',
        metadata: { query: trimmedBrandName, durationMs: Date.now() - startTime },
      };
    }
  }

  /**
   * Fetch ads by advertiser ID
   */
  async fetchAdsByAdvertiserId(advertiserId: string, options: FetchAdsOptions = {}): Promise<FetchAdsResult> {
    const startTime = Date.now();

    this.logger.info('Fetching ads by advertiser ID', { advertiserId });

    try {
      const maxAds = options.maxAds || this.config.defaultMaxAds;
      // Use advertiser ID directly (AR format) as searchInput
      const actorInput = {
        searchInputs: [advertiserId],
        maxPagesPerInput: 1,
        maxItems: maxAds,
      };

      const run = await this.client.actor(this.config.actorId).call(actorInput, {
        timeout: Math.floor(this.config.defaultTimeoutMs / 1000),
        waitSecs: Math.floor(this.config.defaultTimeoutMs / 1000),
      });

      if (run.status !== 'SUCCEEDED') {
        return {
          success: false,
          ads: [],
          error: 'Failed to fetch ads',
          errorCode: ApifyErrorCode.RUN_FAILED,
          metadata: { query: advertiserId, durationMs: Date.now() - startTime },
        };
      }

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      // Log first raw item to see structure
      if (items.length > 0) {
        this.logger.info('Sample raw ad data (by ID)', { sample: JSON.stringify(items[0], null, 2) });
      }

      const normalizedAds = items.map((item) =>
        this.normalizeAd(item as GoogleAdRawItem, '')
      );

      const finalAds = normalizedAds.slice(0, maxAds);

      return {
        success: true,
        ads: finalAds,
        totalFound: normalizedAds.length,
        metadata: {
          query: advertiserId,
          durationMs: Date.now() - startTime,
          runId: run.id,
          datasetId: run.defaultDatasetId,
        },
      };
    } catch (error) {
      this.logger.error('Error fetching ads by advertiser ID', { error: String(error) });
      return {
        success: false,
        ads: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: ApifyErrorCode.UNKNOWN,
        metadata: { query: advertiserId, durationMs: Date.now() - startTime },
      };
    }
  }

  /**
   * Extract image URL from HTML img tag
   */
  private extractImageUrl(html?: string): string | undefined {
    if (!html) return undefined;
    // Match src="..." in img tag
    const match = html.match(/src=["']([^"']+)["']/);
    return match ? match[1] : undefined;
  }

  /**
   * Normalize raw Google ad to standard Ad format
   */
  private normalizeAd(raw: GoogleAdRawItem, searchTerm: string): Ad {
    const adId = raw.creativeId || `google-${Date.now()}-${Math.random()}`;
    const advertiserId = raw.advertiserId || '';
    const advertiserName = raw.advertiserName || searchTerm;

    // Determine format from adType
    let format: AdFormat = 'unknown';
    const adType = (raw.adType || '').toLowerCase();
    if (adType.includes('video')) {
      format = 'video';
    } else if (adType.includes('image')) {
      format = 'image';
    } else if (adType.includes('text')) {
      format = 'text';
    }

    // Extract media from variations
    let imageUrl: string | undefined;
    let videoUrl: string | undefined;
    const media: AdMedia[] = [];

    if (raw.variations && raw.variations.length > 0) {
      for (const variation of raw.variations) {
        // Check textAdMetadata for image (contains HTML img tag)
        if (variation.textAdMetadata?.iframeUrl) {
          const extractedUrl = this.extractImageUrl(variation.textAdMetadata.iframeUrl);
          if (extractedUrl && !imageUrl) {
            imageUrl = extractedUrl;
            media.push({ type: 'image', url: extractedUrl });
          }
        }
        // Check imageAdMetadata
        if (variation.imageAdMetadata?.imageUrl) {
          if (!imageUrl) {
            imageUrl = variation.imageAdMetadata.imageUrl;
            media.push({ type: 'image', url: variation.imageAdMetadata.imageUrl });
          }
        }
        // Check videoAdMetadata
        if (variation.videoAdMetadata?.videoUrl) {
          if (!videoUrl) {
            videoUrl = variation.videoAdMetadata.videoUrl;
            media.push({
              type: 'video',
              url: variation.videoAdMetadata.videoUrl,
              thumbnailUrl: variation.videoAdMetadata.thumbnailUrl,
            });
          }
        }
      }
    }

    // Determine platforms - default to google_display for Google Ads Transparency
    const platforms: AdPlatform[] = ['google_display'];

    // Determine status based on date range
    let status: AdStatus = 'active'; // Assume active if in transparency center

    // Build ad library URL with creative ID
    const adLibraryUrl = advertiserId && adId
      ? `https://adstransparency.google.com/advertiser/${advertiserId}/creative/${adId}`
      : advertiserId
        ? `https://adstransparency.google.com/advertiser/${advertiserId}`
        : 'https://adstransparency.google.com/';

    return {
      id: adId,
      pageId: advertiserId,
      brandName: advertiserName,
      status,
      format,
      platforms,
      media,
      imageUrl,
      videoUrl,
      adLibraryUrl,
      fetchedAt: new Date(),
    };
  }
}

export default GoogleAdsService;
