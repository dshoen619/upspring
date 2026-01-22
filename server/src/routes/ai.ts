/**
 * AI API Routes
 * Endpoints for AI-powered ads analysis and competitor discovery
 */

import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AIService } from '../services/groq';
import { Ad, KeyInsight, CompetitorSuggestion, AIError, AIErrorCode } from '../types';

/**
 * Load available brand names from cache
 */
function loadAvailableBrands(): string[] {
  try {
    const cachePath = join(__dirname, '../data/brands.json');
    const content = readFileSync(cachePath, 'utf-8');
    const cache = JSON.parse(content) as { advertisers?: Record<string, { name: string }>; brands?: Record<string, { name: string }> };
    const data = cache.advertisers || cache.brands || {};
    return Object.values(data).map(b => b.name);
  } catch (error) {
    console.warn('[AIRoute] Failed to load brands cache:', error);
    return [];
  }
}

const router = Router();

/**
 * Logger for request debugging
 */
const log = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.info(`[INFO] [AIRoute] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] [AIRoute] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] [AIRoute] ${message}`, meta ? JSON.stringify(meta) : '');
  },
};

/**
 * Request body for ads analysis endpoint
 */
interface AnalyzeAdsRequestBody {
  ads: Ad[];
  question: string;
}

/**
 * Response type for ads analysis endpoint
 */
interface AnalyzeAdsResponse {
  success: boolean;
  answer: string;
  keyInsights: KeyInsight[];
  confidence: number;
  error?: string;
}

/**
 * Request body for competitor suggestions endpoint
 */
interface CompetitorRequestBody {
  brandName: string;
  industry?: string;
}

/**
 * Response type for competitor suggestions endpoint
 */
interface CompetitorResponse {
  success: boolean;
  competitors: CompetitorSuggestion[];
  brandCategory: string;
  error?: string;
}

/**
 * POST /api/ai/analyze
 * Analyze ads with AI
 *
 * Request Body:
 * - ads (required): Array of Ad objects to analyze
 * - question (required): Question to answer about the ads
 */
router.post('/analyze', async (req: Request<object, AnalyzeAdsResponse, AnalyzeAdsRequestBody>, res: Response<AnalyzeAdsResponse>) => {
  const { ads, question } = req.body;

  log.info('AI analysis request received', {
    adsCount: ads?.length,
    questionLength: question?.length,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Validate required parameters
  if (!ads || !Array.isArray(ads)) {
    log.warn('Missing or invalid ads parameter');
    return res.status(400).json({
      success: false,
      answer: '',
      keyInsights: [],
      confidence: 0,
      error: 'ads is required and must be an array of Ad objects.',
    });
  }

  if (ads.length === 0) {
    log.warn('Empty ads array provided');
    return res.status(400).json({
      success: false,
      answer: '',
      keyInsights: [],
      confidence: 0,
      error: 'At least one ad is required for analysis.',
    });
  }

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    log.warn('Missing or invalid question parameter');
    return res.status(400).json({
      success: false,
      answer: '',
      keyInsights: [],
      confidence: 0,
      error: 'question is required and must be a non-empty string.',
    });
  }

  // Validate question length
  if (question.length > 1000) {
    log.warn('Question too long', { length: question.length });
    return res.status(400).json({
      success: false,
      answer: '',
      keyInsights: [],
      confidence: 0,
      error: 'question must be 1000 characters or less.',
    });
  }

  // Validate ads array doesn't exceed reasonable limit
  if (ads.length > 100) {
    log.warn('Too many ads provided', { count: ads.length });
    return res.status(400).json({
      success: false,
      answer: '',
      keyInsights: [],
      confidence: 0,
      error: 'Maximum of 100 ads can be analyzed at once.',
    });
  }

  try {
    // Initialize the AIService
    const aiService = new AIService();

    log.info('Starting AI analysis', {
      adsCount: ads.length,
      questionPreview: question.substring(0, 100),
    });

    // Analyze ads using the service
    const result = await aiService.analyzeAds(ads, question.trim());

    log.info('AI analysis completed successfully', {
      adsAnalyzed: result.adsAnalyzed,
      confidence: result.confidence,
      insightsCount: result.keyInsights.length,
      tokensUsed: result.tokensUsed?.total,
    });

    return res.json({
      success: true,
      answer: result.answer,
      keyInsights: result.keyInsights,
      confidence: result.confidence,
    });
  } catch (error) {
    // Handle AIError specifically
    if (error instanceof AIError) {
      log.error('AIError during analysis', {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      });

      const statusCode = getStatusCodeForAIError(error.code);

      return res.status(statusCode).json({
        success: false,
        answer: '',
        keyInsights: [],
        confidence: 0,
        error: getUserFriendlyAIErrorMessage(error.code, error.message),
      });
    }

    // Handle generic errors
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

    log.error('Unexpected error during AI analysis', {
      error: errorMessage,
    });

    return res.status(500).json({
      success: false,
      answer: '',
      keyInsights: [],
      confidence: 0,
      error: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred during analysis. Please try again later.'
        : errorMessage,
    });
  }
});

/**
 * POST /api/ai/competitors
 * Get competitor suggestions for a brand
 *
 * Request Body:
 * - brandName (required): Brand name to find competitors for
 * - industry (optional): Industry hint for better results
 */
router.post('/competitors', async (req: Request<object, CompetitorResponse, CompetitorRequestBody>, res: Response<CompetitorResponse>) => {
  const { brandName, industry } = req.body;

  log.info('Competitor suggestions request received', {
    brandName,
    industry,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Validate required parameters
  if (!brandName || typeof brandName !== 'string' || brandName.trim().length === 0) {
    log.warn('Missing or invalid brandName parameter');
    return res.status(400).json({
      success: false,
      competitors: [],
      brandCategory: '',
      error: 'brandName is required and must be a non-empty string.',
    });
  }

  // Validate brandName length
  if (brandName.length > 200) {
    log.warn('Brand name too long', { length: brandName.length });
    return res.status(400).json({
      success: false,
      competitors: [],
      brandCategory: '',
      error: 'brandName must be 200 characters or less.',
    });
  }

  // Validate industry if provided
  if (industry !== undefined && (typeof industry !== 'string' || industry.length > 200)) {
    log.warn('Invalid industry parameter', { industry });
    return res.status(400).json({
      success: false,
      competitors: [],
      brandCategory: '',
      error: 'industry must be a string of 200 characters or less.',
    });
  }

  try {
    // Initialize the AIService
    const aiService = new AIService();

    // Load available brands from cache
    const availableBrands = loadAvailableBrands();

    log.info('Starting competitor discovery', {
      brandName: brandName.trim(),
      industry: industry?.trim(),
      availableBrandsCount: availableBrands.length,
    });

    // Get competitor suggestions using the service (restricted to cached brands)
    const result = await aiService.suggestCompetitors(
      brandName.trim(),
      industry?.trim(),
      availableBrands.length > 0 ? availableBrands : undefined
    );

    log.info('Competitor discovery completed successfully', {
      brandName: brandName.trim(),
      brandCategory: result.brandCategory,
      competitorsCount: result.competitors.length,
      tokensUsed: result.tokensUsed?.total,
    });

    return res.json({
      success: true,
      competitors: result.competitors,
      brandCategory: result.brandCategory,
    });
  } catch (error) {
    // Handle AIError specifically
    if (error instanceof AIError) {
      log.error('AIError during competitor discovery', {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      });

      const statusCode = getStatusCodeForAIError(error.code);

      return res.status(statusCode).json({
        success: false,
        competitors: [],
        brandCategory: '',
        error: getUserFriendlyAIErrorMessage(error.code, error.message),
      });
    }

    // Handle generic errors
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

    log.error('Unexpected error during competitor discovery', {
      error: errorMessage,
    });

    return res.status(500).json({
      success: false,
      competitors: [],
      brandCategory: '',
      error: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred during competitor discovery. Please try again later.'
        : errorMessage,
    });
  }
});

/**
 * Get appropriate HTTP status code for AIErrorCode
 */
function getStatusCodeForAIError(errorCode: AIErrorCode): number {
  switch (errorCode) {
    case AIErrorCode.INVALID_API_KEY:
      return 401;
    case AIErrorCode.RATE_LIMIT:
      return 429;
    case AIErrorCode.MODEL_NOT_AVAILABLE:
      return 503;
    case AIErrorCode.CONTEXT_TOO_LONG:
      return 400;
    case AIErrorCode.NO_ADS_PROVIDED:
      return 400;
    case AIErrorCode.INVALID_RESPONSE:
      return 502;
    case AIErrorCode.NETWORK_ERROR:
      return 503;
    case AIErrorCode.UNKNOWN:
    default:
      return 500;
  }
}

/**
 * Get user-friendly error message for AIErrorCode
 */
function getUserFriendlyAIErrorMessage(errorCode: AIErrorCode, originalMessage: string): string {
  switch (errorCode) {
    case AIErrorCode.INVALID_API_KEY:
      return 'AI service configuration error. Please contact support.';
    case AIErrorCode.RATE_LIMIT:
      return 'AI service is currently busy. Please wait a moment and try again.';
    case AIErrorCode.MODEL_NOT_AVAILABLE:
      return 'AI model is temporarily unavailable. Please try again later.';
    case AIErrorCode.CONTEXT_TOO_LONG:
      return 'Too much data to analyze. Please reduce the number of ads and try again.';
    case AIErrorCode.NO_ADS_PROVIDED:
      return 'No ads provided for analysis.';
    case AIErrorCode.INVALID_RESPONSE:
      return 'AI service returned an invalid response. Please try again.';
    case AIErrorCode.NETWORK_ERROR:
      return 'Unable to reach AI service. Please check your connection and try again.';
    case AIErrorCode.UNKNOWN:
    default:
      return process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred. Please try again later.'
        : originalMessage;
  }
}

export default router;
