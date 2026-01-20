/**
 * Common TypeScript interfaces and types for the application
 */

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface EnvironmentConfig {
  port: number;
  nodeEnv: string;
  apifyApiKey?: string;
  groqApiKey?: string;
}

// Export all ad-related types
export * from './ads';

// Export all AI-related types
export * from './ai';
