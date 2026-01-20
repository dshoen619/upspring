/**
 * Groq LLM Integration Service
 * Provides AI-powered ads analysis and competitor discovery
 */

import Groq from 'groq-sdk';
import { Ad } from '../types/ads';
import {
  AIServiceConfig,
  AdsAnalysisRequest,
  AdsAnalysisResponse,
  CompetitorSuggestion,
  CompetitorSuggestionsResponse,
  AdSummary,
  KeyInsight,
  AIError,
  AIErrorCode,
} from '../types/ai';

/** Default model to use */
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

/** Default temperature for responses */
const DEFAULT_TEMPERATURE = 0.7;

/** Default max tokens */
const DEFAULT_MAX_TOKENS = 2048;

/** Maximum ads to include in context to avoid token limits */
const MAX_ADS_IN_CONTEXT = 50;

/** Maximum characters for primary text per ad */
const MAX_PRIMARY_TEXT_LENGTH = 300;

/**
 * AIService class for Groq LLM integration
 * Provides ads analysis and competitor discovery capabilities
 */
export class AIService {
  private client: Groq;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  /**
   * Create a new AIService instance
   * @param config - Configuration options (optional, uses env vars by default)
   */
  constructor(config?: Partial<AIServiceConfig>) {
    const apiKey = config?.apiKey || process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new AIError(
        'GROQ_API_KEY is required. Set it in environment variables or pass it in config.',
        AIErrorCode.INVALID_API_KEY
      );
    }

    this.client = new Groq({ apiKey });
    this.model = config?.model || DEFAULT_MODEL;
    this.temperature = config?.temperature ?? DEFAULT_TEMPERATURE;
    this.maxTokens = config?.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  /**
   * Analyze ads and answer user questions
   * @param request - The analysis request containing ads and question
   * @returns Analysis response with answer, confidence, and key insights
   */
  async analyzeAds(request: AdsAnalysisRequest): Promise<AdsAnalysisResponse>;
  async analyzeAds(ads: Ad[], question: string): Promise<AdsAnalysisResponse>;
  async analyzeAds(
    adsOrRequest: Ad[] | AdsAnalysisRequest,
    questionArg?: string
  ): Promise<AdsAnalysisResponse> {
    // Handle both call signatures
    const ads = Array.isArray(adsOrRequest) ? adsOrRequest : adsOrRequest.ads;
    const question = Array.isArray(adsOrRequest) ? questionArg! : adsOrRequest.question;

    if (!ads || ads.length === 0) {
      throw new AIError(
        'No ads provided for analysis',
        AIErrorCode.NO_ADS_PROVIDED
      );
    }

    if (!question || question.trim().length === 0) {
      throw new AIError(
        'Question is required for analysis',
        AIErrorCode.INVALID_RESPONSE
      );
    }

    // Smart context selection - summarize ads to reduce tokens
    const adSummaries = this.summarizeAds(ads);
    const prompt = this.buildAdsAnalysisPrompt(adSummaries, question, ads.length);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getAdsAnalysisSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new AIError(
          'Empty response from LLM',
          AIErrorCode.INVALID_RESPONSE
        );
      }

      const parsed = this.parseAdsAnalysisResponse(responseContent);

      return {
        ...parsed,
        adsAnalyzed: adSummaries.length,
        model: this.model,
        tokensUsed: completion.usage
          ? {
              prompt: completion.usage.prompt_tokens,
              completion: completion.usage.completion_tokens,
              total: completion.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }
      throw this.handleGroqError(error);
    }
  }

  /**
   * Suggest competitors for a given brand
   * @param brandName - The brand to find competitors for
   * @param industry - Optional industry hint for better results
   * @param availableBrands - Optional list of brands to choose from (restricts suggestions)
   * @returns Competitor suggestions with explanations
   */
  async suggestCompetitors(
    brandName: string,
    industry?: string,
    availableBrands?: string[]
  ): Promise<CompetitorSuggestionsResponse> {
    if (!brandName || brandName.trim().length === 0) {
      throw new AIError(
        'Brand name is required',
        AIErrorCode.INVALID_RESPONSE
      );
    }

    const prompt = this.buildCompetitorPrompt(brandName, industry, availableBrands);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getCompetitorSystemPrompt(availableBrands),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new AIError(
          'Empty response from LLM',
          AIErrorCode.INVALID_RESPONSE
        );
      }

      const parsed = this.parseCompetitorResponse(responseContent);

      return {
        ...parsed,
        queriedBrand: brandName,
        model: this.model,
        tokensUsed: completion.usage
          ? {
              prompt: completion.usage.prompt_tokens,
              completion: completion.usage.completion_tokens,
              total: completion.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }
      throw this.handleGroqError(error);
    }
  }

  /**
   * Summarize ads for LLM context to reduce token usage
   */
  private summarizeAds(ads: Ad[]): AdSummary[] {
    // Take only the most relevant ads to avoid context limits
    const selectedAds = ads.slice(0, MAX_ADS_IN_CONTEXT);

    return selectedAds.map((ad) => {
      const summary: AdSummary = {
        id: ad.id,
        brand: ad.brandName,
        format: ad.format,
        platforms: ad.platforms,
        status: ad.status,
      };

      if (ad.headline) {
        summary.headline = ad.headline;
      }

      if (ad.primaryText) {
        summary.primaryText =
          ad.primaryText.length > MAX_PRIMARY_TEXT_LENGTH
            ? ad.primaryText.substring(0, MAX_PRIMARY_TEXT_LENGTH) + '...'
            : ad.primaryText;
      }

      if (ad.callToAction?.text) {
        summary.cta = ad.callToAction.text;
      }

      if (ad.performanceSignals?.daysRunning) {
        summary.daysRunning = ad.performanceSignals.daysRunning;
      }

      if (ad.performanceSignals?.spendEstimate) {
        summary.spendEstimate = ad.performanceSignals.spendEstimate;
      }

      return summary;
    });
  }

  /**
   * Build the system prompt for ads analysis
   */
  private getAdsAnalysisSystemPrompt(): string {
    return `You are an expert advertising analyst specializing in digital marketing, creative strategy, and competitive intelligence. Your role is to analyze advertising data and provide actionable insights.

When analyzing ads, consider:
- Messaging patterns and angles (emotional vs rational, problem/solution, social proof, etc.)
- Creative elements (formats, visuals described by context, CTAs)
- Targeting signals (platforms, demographics if available)
- Performance indicators (longevity, estimated spend)
- Brand positioning and voice

Always provide specific examples from the data to support your insights. Be concise but thorough.

IMPORTANT: Respond ONLY with valid JSON in this exact format:
{
  "answer": "Your detailed analysis answering the user's question",
  "confidence": 0.85,
  "keyInsights": [
    {
      "category": "messaging|creative|targeting|performance|trend|general",
      "insight": "The specific insight",
      "evidence": "Supporting example or data point"
    }
  ]
}

Confidence should be between 0 and 1, based on data quality and relevance to the question.`;
  }

  /**
   * Build the analysis prompt with ad data
   */
  private buildAdsAnalysisPrompt(
    summaries: AdSummary[],
    question: string,
    totalAds: number
  ): string {
    // Build a structured summary rather than dumping JSON
    const formatBreakdown = this.getFormatBreakdown(summaries);
    const platformBreakdown = this.getPlatformBreakdown(summaries);
    const statusBreakdown = this.getStatusBreakdown(summaries);
    const ctaBreakdown = this.getCtaBreakdown(summaries);

    let prompt = `## Advertising Data Summary

**Dataset Overview:**
- Total ads in dataset: ${totalAds}
- Ads analyzed: ${summaries.length}
- Brands represented: ${this.getUniqueBrands(summaries).join(', ')}

**Format Distribution:**
${formatBreakdown}

**Platform Distribution:**
${platformBreakdown}

**Status Distribution:**
${statusBreakdown}

**Common CTAs:**
${ctaBreakdown}

## Ad Details

`;

    // Group ads by brand for better readability
    const adsByBrand = this.groupAdsByBrand(summaries);
    for (const [brand, brandAds] of Object.entries(adsByBrand)) {
      prompt += `### ${brand} (${brandAds.length} ads)\n\n`;

      for (const ad of brandAds.slice(0, 10)) { // Limit per brand
        prompt += `**Ad ${ad.id}** [${ad.format}, ${ad.status}]\n`;
        if (ad.headline) prompt += `- Headline: "${ad.headline}"\n`;
        if (ad.primaryText) prompt += `- Copy: "${ad.primaryText}"\n`;
        if (ad.cta) prompt += `- CTA: ${ad.cta}\n`;
        if (ad.daysRunning) prompt += `- Running: ${ad.daysRunning} days\n`;
        if (ad.spendEstimate) prompt += `- Est. Spend: ${ad.spendEstimate}\n`;
        prompt += '\n';
      }

      if (brandAds.length > 10) {
        prompt += `... and ${brandAds.length - 10} more ads from ${brand}\n\n`;
      }
    }

    prompt += `## User Question

${question}

Please analyze the advertising data above and answer the question. Provide specific examples and actionable insights.`;

    return prompt;
  }

  /**
   * Get system prompt for competitor discovery
   */
  private getCompetitorSystemPrompt(availableBrands?: string[]): string {
    if (availableBrands && availableBrands.length > 0) {
      return `You are a market research expert with deep knowledge of competitive landscapes across industries. Your role is to identify relevant competitors for brands.

CRITICAL CONSTRAINT: You MUST ONLY suggest competitors from the following list of available brands. Do not suggest any brand that is not in this list:

${availableBrands.join(', ')}

When suggesting competitors from the available list, consider:
- Direct competitors (same product/service category)
- Indirect competitors (alternative solutions)
- Market positioning and price point

IMPORTANT: Respond ONLY with valid JSON in this exact format:
{
  "brandCategory": "The industry/category you've classified this brand into",
  "competitors": [
    {
      "name": "Competitor Name (MUST be from the available list)",
      "reason": "Brief explanation of why they compete",
      "confidence": 0.9
    }
  ]
}

Only suggest competitors that exist in the available brands list above. Suggest up to 8 competitors, ordered by relevance. If you cannot find relevant competitors in the list, return fewer suggestions or an empty array.`;
    }

    return `You are a market research expert with deep knowledge of competitive landscapes across industries. Your role is to identify relevant competitors for brands.

When suggesting competitors, consider:
- Direct competitors (same product/service category)
- Indirect competitors (alternative solutions)
- Aspirational competitors (brands the target might admire)
- Market positioning and price point
- Geographic relevance

Provide diverse suggestions that would be valuable for competitive advertising research.

IMPORTANT: Respond ONLY with valid JSON in this exact format:
{
  "brandCategory": "The industry/category you've classified this brand into",
  "competitors": [
    {
      "name": "Competitor Name",
      "reason": "Brief explanation of why they compete",
      "confidence": 0.9,
      "website": "optional-website.com"
    }
  ]
}

Suggest 5-8 competitors, ordered by relevance. Confidence should be between 0 and 1.`;
  }

  /**
   * Build prompt for competitor discovery
   */
  private buildCompetitorPrompt(brandName: string, industry?: string, availableBrands?: string[]): string {
    let prompt = `Find relevant competitors for the brand: **${brandName}**`;

    if (industry) {
      prompt += `\n\nIndustry context: ${industry}`;
    }

    if (availableBrands && availableBrands.length > 0) {
      prompt += `\n\nREMEMBER: You can ONLY suggest competitors from the available brands list provided in the system prompt. Do not suggest any other brands.`;
    }

    prompt += `\n\nPlease suggest competitors that would be valuable for competitive advertising research.`;

    return prompt;
  }

  /**
   * Parse the LLM response for ads analysis
   */
  private parseAdsAnalysisResponse(content: string): Omit<AdsAnalysisResponse, 'adsAnalyzed' | 'model' | 'tokensUsed'> {
    try {
      const parsed = JSON.parse(content);

      // Validate required fields
      if (typeof parsed.answer !== 'string') {
        throw new Error('Missing or invalid answer field');
      }

      const confidence = typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.7;

      const keyInsights: KeyInsight[] = Array.isArray(parsed.keyInsights)
        ? parsed.keyInsights.map((insight: Record<string, unknown>) => ({
            category: this.validateInsightCategory(insight.category as string),
            insight: String(insight.insight || ''),
            evidence: insight.evidence ? String(insight.evidence) : undefined,
          }))
        : [];

      return {
        answer: parsed.answer,
        confidence,
        keyInsights,
      };
    } catch (error) {
      throw new AIError(
        `Failed to parse LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        AIErrorCode.INVALID_RESPONSE,
        undefined,
        { rawContent: content }
      );
    }
  }

  /**
   * Parse the LLM response for competitor suggestions
   */
  private parseCompetitorResponse(content: string): Omit<CompetitorSuggestionsResponse, 'queriedBrand' | 'model' | 'tokensUsed'> {
    try {
      const parsed = JSON.parse(content);

      const brandCategory = typeof parsed.brandCategory === 'string'
        ? parsed.brandCategory
        : 'Unknown';

      const competitors: CompetitorSuggestion[] = Array.isArray(parsed.competitors)
        ? parsed.competitors.map((comp: Record<string, unknown>) => ({
            name: String(comp.name || ''),
            reason: String(comp.reason || ''),
            confidence: typeof comp.confidence === 'number'
              ? Math.max(0, Math.min(1, comp.confidence))
              : 0.7,
            website: comp.website ? String(comp.website) : undefined,
          }))
        : [];

      return {
        brandCategory,
        competitors,
      };
    } catch (error) {
      throw new AIError(
        `Failed to parse LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        AIErrorCode.INVALID_RESPONSE,
        undefined,
        { rawContent: content }
      );
    }
  }

  /**
   * Validate insight category
   */
  private validateInsightCategory(category: string): KeyInsight['category'] {
    const validCategories: KeyInsight['category'][] = [
      'messaging', 'creative', 'targeting', 'performance', 'trend', 'general'
    ];
    return validCategories.includes(category as KeyInsight['category'])
      ? (category as KeyInsight['category'])
      : 'general';
  }

  /**
   * Handle Groq API errors
   */
  private handleGroqError(error: unknown): AIError {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('api key') || message.includes('authentication') || message.includes('unauthorized')) {
        return new AIError(
          'Invalid or expired Groq API key',
          AIErrorCode.INVALID_API_KEY,
          401
        );
      }

      if (message.includes('rate limit') || message.includes('too many requests')) {
        return new AIError(
          'Groq API rate limit exceeded. Please try again later.',
          AIErrorCode.RATE_LIMIT,
          429
        );
      }

      if (message.includes('model') && (message.includes('not found') || message.includes('not available'))) {
        return new AIError(
          `Model ${this.model} is not available`,
          AIErrorCode.MODEL_NOT_AVAILABLE,
          404
        );
      }

      if (message.includes('context') || message.includes('token')) {
        return new AIError(
          'Context too long for the model. Try analyzing fewer ads.',
          AIErrorCode.CONTEXT_TOO_LONG,
          400
        );
      }

      if (message.includes('network') || message.includes('econnrefused') || message.includes('timeout')) {
        return new AIError(
          'Network error connecting to Groq API',
          AIErrorCode.NETWORK_ERROR,
          503
        );
      }

      return new AIError(
        `Groq API error: ${error.message}`,
        AIErrorCode.UNKNOWN,
        500,
        { originalError: error.message }
      );
    }

    return new AIError(
      'Unknown error occurred',
      AIErrorCode.UNKNOWN,
      500
    );
  }

  // Helper methods for building prompts

  private getFormatBreakdown(summaries: AdSummary[]): string {
    const counts: Record<string, number> = {};
    for (const s of summaries) {
      counts[s.format] = (counts[s.format] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([format, count]) => `- ${format}: ${count} ads`)
      .join('\n');
  }

  private getPlatformBreakdown(summaries: AdSummary[]): string {
    const counts: Record<string, number> = {};
    for (const s of summaries) {
      for (const platform of s.platforms) {
        counts[platform] = (counts[platform] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([platform, count]) => `- ${platform}: ${count} ads`)
      .join('\n');
  }

  private getStatusBreakdown(summaries: AdSummary[]): string {
    const counts: Record<string, number> = {};
    for (const s of summaries) {
      counts[s.status] = (counts[s.status] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([status, count]) => `- ${status}: ${count} ads`)
      .join('\n');
  }

  private getCtaBreakdown(summaries: AdSummary[]): string {
    const counts: Record<string, number> = {};
    for (const s of summaries) {
      if (s.cta) {
        counts[s.cta] = (counts[s.cta] || 0) + 1;
      }
    }
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return sorted.length > 0
      ? sorted.map(([cta, count]) => `- "${cta}": ${count} ads`).join('\n')
      : '- No CTA data available';
  }

  private getUniqueBrands(summaries: AdSummary[]): string[] {
    return [...new Set(summaries.map(s => s.brand))];
  }

  private groupAdsByBrand(summaries: AdSummary[]): Record<string, AdSummary[]> {
    const grouped: Record<string, AdSummary[]> = {};
    for (const summary of summaries) {
      if (!grouped[summary.brand]) {
        grouped[summary.brand] = [];
      }
      grouped[summary.brand].push(summary);
    }
    return grouped;
  }

  /**
   * Update service configuration
   */
  setModel(model: string): void {
    this.model = model;
  }

  setTemperature(temperature: number): void {
    this.temperature = Math.max(0, Math.min(2, temperature));
  }

  setMaxTokens(maxTokens: number): void {
    this.maxTokens = Math.max(1, maxTokens);
  }

  /**
   * Get current configuration
   */
  getConfig(): { model: string; temperature: number; maxTokens: number } {
    return {
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };
  }
}

/**
 * Create a singleton instance for convenience
 * Will throw if GROQ_API_KEY is not set when called
 */
let defaultInstance: AIService | null = null;

export function getAIService(config?: Partial<AIServiceConfig>): AIService {
  if (!defaultInstance || config) {
    defaultInstance = new AIService(config);
  }
  return defaultInstance;
}

export default AIService;
