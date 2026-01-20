/**
 * TypeScript interfaces for the client
 * Mirrors server types for type safety
 */

// Ad Types
export type AdPlatform = 'facebook' | 'instagram' | 'messenger' | 'audience_network' | 'unknown';
export type AdStatus = 'active' | 'inactive' | 'removed' | 'unknown';
export type AdFormat = 'image' | 'video' | 'carousel' | 'collection' | 'unknown';

export interface AdPerformanceSignals {
  reachEstimate?: string;
  impressionsEstimate?: string;
  spendEstimate?: string;
  currency?: string;
  daysRunning?: number;
}

export interface AdDemographics {
  ageRange?: string;
  gender?: 'all' | 'male' | 'female' | 'unknown';
  regions?: string[];
}

export interface AdMedia {
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface AdCallToAction {
  text?: string;
  type?: string;
  linkUrl?: string;
}

export interface Ad {
  id: string;
  adLibraryId?: string;
  brandName: string;
  pageId?: string;
  pageUrl?: string;
  headline?: string;
  primaryText?: string;
  description?: string;
  caption?: string;
  callToAction?: AdCallToAction;
  imageUrl?: string;
  videoUrl?: string;
  media?: AdMedia[];
  platforms: AdPlatform[];
  format: AdFormat;
  startDate?: string;
  endDate?: string;
  status: AdStatus;
  performanceSignals?: AdPerformanceSignals;
  demographics?: AdDemographics;
  categories?: string[];
  adLibraryUrl?: string;
  snapshotUrl?: string;
  fetchedAt: string;
}

// AI Types
export interface KeyInsight {
  category: 'messaging' | 'creative' | 'targeting' | 'performance' | 'trend' | 'general';
  insight: string;
  evidence?: string;
}

export interface AdsAnalysisResponse {
  success: boolean;
  answer: string;
  confidence: number;
  keyInsights: KeyInsight[];
  error?: string;
}

export interface CompetitorSuggestion {
  name: string;
  reason: string;
  confidence: number;
  website?: string;
}

export interface CompetitorSuggestionsResponse {
  success: boolean;
  competitors: CompetitorSuggestion[];
  brandCategory: string;
  error?: string;
}

// API Response Types
export type BrandSource = 'cached' | 'discovered' | 'not_verified';

export interface FetchAdsResponse {
  success: boolean;
  ads: Ad[];
  total: number;
  error?: string;
  /** How the brand was resolved */
  brandSource?: BrandSource;
  /** The verified brand name (may differ from search term) */
  verifiedBrandName?: string;
}

// UI State Types
export interface BrandState {
  brandName: string;
  ads: Ad[];
  isLoading: boolean;
  error: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  keyInsights?: KeyInsight[];
}
