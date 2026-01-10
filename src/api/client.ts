/**
 * API Client
 * Backend API 통신 래퍼
 */

import type { QAResponse, HealthStatus } from '../types';

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

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.error || `HTTP ${response.status}`,
      response.status,
      error.details
    );
  }

  return response.json();
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
export async function getHistory(
  limit = 50,
  sessionId?: string
): Promise<unknown[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (sessionId) params.append('sessionId', sessionId);

  return request<unknown[]>(`/history?${params}`);
}

/**
 * Dashboard API
 */
export async function getDashboardSummary(): Promise<unknown> {
  return request<unknown>('/dashboard/summary');
}

export async function getDailyStats(): Promise<unknown> {
  return request<unknown>('/dashboard/daily');
}

export async function getCategoryStats(): Promise<unknown> {
  return request<unknown>('/dashboard/categories');
}

export { ApiError };
