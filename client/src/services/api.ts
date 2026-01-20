import axios from 'axios';
import type { AxiosError } from 'axios';
import type {
  Ad,
  FetchAdsResponse,
  AdsAnalysisResponse,
  CompetitorSuggestionsResponse,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 2 minutes for long-running operations
  headers: {
    'Content-Type': 'application/json',
  },
});

// Error handling helper
function handleError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    if (axiosError.response?.data?.error) {
      return axiosError.response.data.error;
    }
    if (axiosError.response?.data?.message) {
      return axiosError.response.data.message;
    }
    if (axiosError.code === 'ECONNABORTED') {
      return 'Request timed out. Please try again.';
    }
    if (axiosError.code === 'ERR_NETWORK') {
      return 'Unable to connect to the server. Please check if the server is running.';
    }
    return axiosError.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

/**
 * Fetch ads for a brand
 */
export async function fetchAdsByBrand(
  brandName: string,
  options?: {
    maxAds?: number;
    countryCode?: string;
  }
): Promise<FetchAdsResponse> {
  try {
    const params = new URLSearchParams({
      brand: brandName,
    });
    if (options?.maxAds) {
      params.append('maxAds', options.maxAds.toString());
    }
    if (options?.countryCode) {
      params.append('countryCode', options.countryCode);
    }

    const response = await api.get<FetchAdsResponse>(`/api/ads/search?${params}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      ads: [],
      total: 0,
      error: handleError(error),
    };
  }
}

/**
 * Analyze ads with AI
 */
export async function analyzeAds(
  ads: Ad[],
  question: string
): Promise<AdsAnalysisResponse> {
  try {
    const response = await api.post<AdsAnalysisResponse>('/api/ai/analyze', {
      ads,
      question,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      answer: '',
      confidence: 0,
      keyInsights: [],
      error: handleError(error),
    };
  }
}

/**
 * Get competitor suggestions for a brand
 */
export async function getCompetitors(
  brandName: string,
  industry?: string
): Promise<CompetitorSuggestionsResponse> {
  try {
    const response = await api.post<CompetitorSuggestionsResponse>(
      '/api/ai/competitors',
      {
        brandName,
        industry,
      }
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      competitors: [],
      brandCategory: '',
      error: handleError(error),
    };
  }
}

/**
 * Fetch available brands
 */
export async function fetchBrands(): Promise<{ success: boolean; brands: string[]; error?: string }> {
  try {
    const response = await api.get<{ success: boolean; brands: string[] }>('/api/brands');
    return response.data;
  } catch (error) {
    return {
      success: false,
      brands: [],
      error: handleError(error),
    };
  }
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await api.get('/api/health');
    return response.data.status === 'ok';
  } catch {
    return false;
  }
}

export default api;
