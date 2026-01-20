/**
 * TypeScript interfaces for Ad Library data
 * Supports both Google Ads Transparency Center and Meta Ad Library
 */

/**
 * Platform where the ad is running
 */
export type AdPlatform =
  | 'facebook' | 'instagram' | 'messenger' | 'audience_network'  // Meta
  | 'google_search' | 'google_display' | 'youtube' | 'google_shopping'  // Google
  | 'unknown';

/**
 * Current status of the ad
 */
export type AdStatus = 'active' | 'inactive' | 'removed' | 'unknown';

/**
 * Ad format/type
 */
export type AdFormat = 'image' | 'video' | 'carousel' | 'collection' | 'text' | 'unknown';

/**
 * Performance signals that may be available from the ad library
 */
export interface AdPerformanceSignals {
  /** Estimated reach range (e.g., "10K-50K") */
  reachEstimate?: string;
  /** Estimated impressions range */
  impressionsEstimate?: string;
  /** Estimated spend range (e.g., "$100-$500") */
  spendEstimate?: string;
  /** Currency for spend estimates */
  currency?: string;
  /** Number of days the ad has been running */
  daysRunning?: number;
}

/**
 * Demographic targeting information if available
 */
export interface AdDemographics {
  /** Age range (e.g., "18-65+") */
  ageRange?: string;
  /** Gender targeting */
  gender?: 'all' | 'male' | 'female' | 'unknown';
  /** Geographic regions targeted */
  regions?: string[];
}

/**
 * Media asset in an ad (image or video)
 */
export interface AdMedia {
  /** Type of media */
  type: 'image' | 'video';
  /** URL to the media asset */
  url: string;
  /** Thumbnail URL for videos */
  thumbnailUrl?: string;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Duration in seconds for videos */
  duration?: number;
}

/**
 * Call-to-action button information
 */
export interface AdCallToAction {
  /** CTA button text (e.g., "Shop Now", "Learn More") */
  text?: string;
  /** CTA type identifier */
  type?: string;
  /** Destination URL when CTA is clicked */
  linkUrl?: string;
}

/**
 * Normalized Ad data structure
 */
export interface Ad {
  /** Unique identifier for the ad */
  id: string;
  /** Ad Library ID from Meta */
  adLibraryId?: string;
  /** Brand/Page name that created the ad */
  brandName: string;
  /** Page ID of the advertiser */
  pageId?: string;
  /** Page URL on Facebook */
  pageUrl?: string;
  /** Ad headline text */
  headline?: string;
  /** Primary text/body of the ad */
  primaryText?: string;
  /** Description/link description */
  description?: string;
  /** Caption text */
  caption?: string;
  /** Call-to-action information */
  callToAction?: AdCallToAction;
  /** Primary image URL (first image if multiple) */
  imageUrl?: string;
  /** Primary video URL (first video if multiple) */
  videoUrl?: string;
  /** All media assets in the ad */
  media?: AdMedia[];
  /** Platforms where the ad is shown */
  platforms: AdPlatform[];
  /** Ad format type */
  format: AdFormat;
  /** Date when the ad started running */
  startDate?: Date;
  /** Date when the ad stopped (if inactive) */
  endDate?: Date;
  /** Current status of the ad */
  status: AdStatus;
  /** Performance signals/estimates */
  performanceSignals?: AdPerformanceSignals;
  /** Demographic targeting */
  demographics?: AdDemographics;
  /** Categories/industries the ad is classified under */
  categories?: string[];
  /** URL to view the ad in Ad Library */
  adLibraryUrl?: string;
  /** Snapshot URL from Apify */
  snapshotUrl?: string;
  /** Raw data from the scraper for debugging */
  rawData?: Record<string, unknown>;
  /** Timestamp when this ad was fetched */
  fetchedAt: Date;
}

/**
 * Input parameters for the Apify Meta Ads scraper
 */
export interface ApifyMetaAdsInput {
  /** Search query (brand/page name) */
  searchQuery?: string;
  /** Page ID to search for */
  pageId?: string;
  /** Page IDs to search for (array) */
  pageIds?: string[];
  /** Country code for filtering (e.g., "US", "GB") */
  countryCode?: string;
  /** Filter by ad type */
  adType?: 'all' | 'political_and_issue_ads' | 'housing' | 'employment' | 'credit';
  /** Filter by active status */
  adActiveStatus?: 'all' | 'active' | 'inactive';
  /** Filter by media type */
  mediaType?: 'all' | 'image' | 'meme' | 'video' | 'none';
  /** Maximum number of ads to return */
  maxAds?: number;
  /** Search in specific platforms */
  platforms?: ('facebook' | 'instagram' | 'audience_network' | 'messenger')[];
  /** Start date filter (ISO string) */
  startDate?: string;
  /** End date filter (ISO string) */
  endDate?: string;
  /** Proxy configuration */
  proxyConfiguration?: {
    useApifyProxy?: boolean;
    apifyProxyGroups?: string[];
  };
}

/**
 * Raw ad item from Apify scraper response
 * This may vary based on the exact actor used
 */
export interface ApifyRawAdItem {
  id?: string;
  adArchiveID?: string;
  adid?: string;
  pageID?: string;
  pageName?: string;
  pageUrl?: string;
  pageProfilePictureUrl?: string;
  adText?: string;
  bodyText?: string;
  primaryText?: string;
  headline?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkCaption?: string;
  linkUrl?: string;
  ctaText?: string;
  ctaType?: string;
  imageUrl?: string;
  images?: string[];
  videoUrl?: string;
  videos?: Array<{
    url?: string;
    thumbnailUrl?: string;
    duration?: number;
  }>;
  media?: Array<{
    type?: string;
    url?: string;
    thumbnailUrl?: string;
  }>;
  platforms?: string[];
  publisherPlatform?: string[];
  adCreationTime?: string;
  startDate?: string;
  endDate?: string;
  adDeliveryStartTime?: string;
  adDeliveryStopTime?: string;
  isActive?: boolean;
  isRunning?: boolean;
  status?: string;
  spend?: {
    lowerBound?: number;
    upperBound?: number;
    currency?: string;
  };
  impressions?: {
    lowerBound?: number;
    upperBound?: number;
  };
  reach?: {
    lowerBound?: number;
    upperBound?: number;
  };
  demographicDistribution?: Array<{
    ageRange?: string;
    gender?: string;
    percentage?: number;
  }>;
  regionDistribution?: Array<{
    region?: string;
    percentage?: number;
  }>;
  adSnapshotUrl?: string;
  adLibraryUrl?: string;
  category?: string;
  categories?: string[];
  disclaimerText?: string;
  fundingEntity?: string;
  [key: string]: unknown;
}

/**
 * Apify actor run result
 */
export interface ApifyActorRunResult {
  /** Run ID */
  id: string;
  /** Actor ID */
  actId: string;
  /** Status of the run */
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMING-OUT' | 'TIMED-OUT' | 'ABORTING' | 'ABORTED';
  /** Start time */
  startedAt: string;
  /** Finish time */
  finishedAt?: string;
  /** Default dataset ID */
  defaultDatasetId: string;
  /** Default key-value store ID */
  defaultKeyValueStoreId: string;
}

/**
 * Response from Apify dataset fetch
 */
export interface ApifyDatasetResponse<T = ApifyRawAdItem> {
  /** Array of items from the dataset */
  items: T[];
  /** Total count of items */
  total?: number;
  /** Offset used for pagination */
  offset?: number;
  /** Limit used for pagination */
  limit?: number;
  /** Description of the dataset */
  desc?: boolean;
}

/**
 * Error codes for the Apify integration
 */
export enum ApifyErrorCode {
  /** API key is missing or invalid */
  INVALID_API_KEY = 'INVALID_API_KEY',
  /** Actor not found */
  ACTOR_NOT_FOUND = 'ACTOR_NOT_FOUND',
  /** Actor run failed */
  RUN_FAILED = 'RUN_FAILED',
  /** Actor run timed out */
  TIMEOUT = 'TIMEOUT',
  /** Rate limit exceeded */
  RATE_LIMIT = 'RATE_LIMIT',
  /** No results found */
  NO_RESULTS = 'NO_RESULTS',
  /** Network error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for Apify-related errors
 */
export class ApifyError extends Error {
  constructor(
    message: string,
    public readonly code: ApifyErrorCode,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApifyError';
    Object.setPrototypeOf(this, ApifyError.prototype);
  }
}

/**
 * How the brand was resolved
 */
export type BrandSource =
  | 'cached'      // Brand was found in cache
  | 'discovered'  // Brand was looked up via Apify and cached
  | 'not_verified'; // Brand could not be verified (search didn't find matching page)

/**
 * Result of fetching ads
 */
export interface FetchAdsResult {
  /** Whether the fetch was successful */
  success: boolean;
  /** Array of normalized ads */
  ads: Ad[];
  /** Error message if unsuccessful */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: ApifyErrorCode;
  /** Total number of ads found (may be more than returned) */
  totalFound?: number;
  /** How the brand was resolved */
  brandSource?: BrandSource;
  /** The verified brand name (may differ from search term) */
  verifiedBrandName?: string;
  /** Metadata about the fetch operation */
  metadata?: {
    /** Search query used */
    query: string;
    /** Time taken in milliseconds */
    durationMs: number;
    /** Apify run ID for debugging */
    runId?: string;
    /** Dataset ID for debugging */
    datasetId?: string;
  };
}

/**
 * Options for fetching ads
 */
export interface FetchAdsOptions {
  /** Maximum number of ads to return */
  maxAds?: number;
  /** Country code filter */
  countryCode?: string;
  /** Filter by active status only */
  activeOnly?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Include raw data in results for debugging */
  includeRawData?: boolean;
  /** Filter by platforms */
  platforms?: AdPlatform[];
  /** Start date filter */
  startDate?: Date;
  /** End date filter */
  endDate?: Date;
}
