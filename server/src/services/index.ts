/**
 * Services module
 * Export all business logic services from this file
 */

// Apify integration service for Meta Ad Library scraping
export {
  MetaAdsService,
  createMetaAdsService,
  KNOWN_META_AD_ACTORS,
  type MetaAdsServiceConfig,
} from './apify';

// Re-export ad types for convenience
export type {
  Ad,
  AdPlatform,
  AdStatus,
  AdFormat,
  AdMedia,
  AdPerformanceSignals,
  AdDemographics,
  AdCallToAction,
  FetchAdsResult,
  FetchAdsOptions,
  ApifyError,
  ApifyErrorCode,
} from '../types/ads';
