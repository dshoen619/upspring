/**
 * TypeScript interfaces for AI/LLM integration
 * Used with Groq API for ads analysis and competitor discovery
 */

import { Ad } from './ads';

/**
 * Configuration options for AI service
 */
export interface AIServiceConfig {
  /** Groq API key */
  apiKey: string;
  /** Model to use (default: llama-3.3-70b-versatile) */
  model?: string;
  /** Temperature for response generation (0-2, default: 0.7) */
  temperature?: number;
  /** Maximum tokens in response (default: 2048) */
  maxTokens?: number;
}

/**
 * Request for analyzing ads
 */
export interface AdsAnalysisRequest {
  /** Array of ads to analyze */
  ads: Ad[];
  /** User's question about the ads */
  question: string;
}

/**
 * Key insight extracted from ad analysis
 */
export interface KeyInsight {
  /** Category of the insight */
  category: 'messaging' | 'creative' | 'targeting' | 'performance' | 'trend' | 'general';
  /** The insight itself */
  insight: string;
  /** Supporting evidence or examples */
  evidence?: string;
}

/**
 * Response from ads analysis
 */
export interface AdsAnalysisResponse {
  /** The AI's answer to the user's question */
  answer: string;
  /** Confidence level of the analysis (0-1) */
  confidence: number;
  /** Key insights extracted from the analysis */
  keyInsights: KeyInsight[];
  /** Number of ads that were analyzed */
  adsAnalyzed: number;
  /** Model used for analysis */
  model: string;
  /** Tokens used in the request */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Individual competitor suggestion
 */
export interface CompetitorSuggestion {
  /** Competitor brand/company name */
  name: string;
  /** Reason why this is a relevant competitor */
  reason: string;
  /** Confidence level for this suggestion (0-1) */
  confidence: number;
  /** Optional website URL if known */
  website?: string;
}

/**
 * Response from competitor discovery
 */
export interface CompetitorSuggestionsResponse {
  /** Array of suggested competitors */
  competitors: CompetitorSuggestion[];
  /** Category/industry the brand was classified into */
  brandCategory: string;
  /** The original brand that was queried */
  queriedBrand: string;
  /** Model used for suggestions */
  model: string;
  /** Tokens used in the request */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Summarized ad data for LLM context (to reduce token usage)
 */
export interface AdSummary {
  /** Ad ID for reference */
  id: string;
  /** Brand name */
  brand: string;
  /** Headline text */
  headline?: string;
  /** Primary text (truncated if too long) */
  primaryText?: string;
  /** CTA button text */
  cta?: string;
  /** Ad format */
  format: string;
  /** Platforms */
  platforms: string[];
  /** Status */
  status: string;
  /** Days running (if available) */
  daysRunning?: number;
  /** Spend estimate (if available) */
  spendEstimate?: string;
}

/**
 * Error codes for AI service
 */
export enum AIErrorCode {
  /** API key is missing or invalid */
  INVALID_API_KEY = 'INVALID_API_KEY',
  /** Rate limit exceeded */
  RATE_LIMIT = 'RATE_LIMIT',
  /** Model not available */
  MODEL_NOT_AVAILABLE = 'MODEL_NOT_AVAILABLE',
  /** Context too long */
  CONTEXT_TOO_LONG = 'CONTEXT_TOO_LONG',
  /** Invalid response from LLM */
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  /** Network error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** No ads provided for analysis */
  NO_ADS_PROVIDED = 'NO_ADS_PROVIDED',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for AI-related errors
 */
export class AIError extends Error {
  constructor(
    message: string,
    public readonly code: AIErrorCode,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AIError';
    Object.setPrototypeOf(this, AIError.prototype);
  }
}
