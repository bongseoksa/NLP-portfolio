/**
 * API Client
 * Backend API 통신 래퍼
 */

import type {
  QAResponse,
  HealthStatus,
  QARecord,
  DashboardSummary,
  DailyStats,
  CategoryDistribution,
  SourceContribution,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options?: RequestInit,
  silent = false
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      if (silent) {
        return null as T;
      }
      const error = await response.json().catch(() => ({}));
      throw new ApiError(
        error.error || `HTTP ${response.status}`,
        response.status,
        error.details
      );
    }

    return response.json();
  } catch (error) {
    if (silent) {
      return null as T;
    }
    throw error;
  }
}

/**
 * Health Check API
 */
export async function getHealth(): Promise<HealthStatus> {
  return request<HealthStatus>('/health');
}

/**
 * Q&A API
 */
export async function askQuestion(
  question: string,
  sessionId?: string
): Promise<QAResponse> {
  return request<QAResponse>('/ask', {
    method: 'POST',
    body: JSON.stringify({ question, sessionId }),
  });
}

/**
 * Q&A History API
 */
export async function getHistory(params?: {
  limit?: number;
  sessionId?: string;
}): Promise<QARecord[]> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.sessionId) searchParams.set('sessionId', params.sessionId);

  const query = searchParams.toString();
  const result = await request<QARecord[]>(
    `/history${query ? `?${query}` : ''}`,
    undefined,
    true
  );
  return result || [];
}

/**
 * Dashboard Summary API
 */
export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  return request<DashboardSummary>('/dashboard/summary', undefined, true);
}

/**
 * Daily Stats API
 */
export async function getDailyStats(): Promise<DailyStats[]> {
  const result = await request<DailyStats[]>(
    '/dashboard/daily',
    undefined,
    true
  );
  return result || [];
}

/**
 * Category Distribution API
 */
export async function getCategoryDistribution(): Promise<CategoryDistribution[]> {
  const result = await request<CategoryDistribution[]>(
    '/dashboard/categories',
    undefined,
    true
  );
  return result || [];
}

/**
 * Source Contribution API
 */
export async function getSourceContribution(): Promise<SourceContribution[]> {
  const result = await request<SourceContribution[]>(
    '/dashboard/sources',
    undefined,
    true
  );
  return result || [];
}

export { ApiError };
