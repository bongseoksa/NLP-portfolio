/**
 * TanStack Query Hooks
 * 서버 상태 관리 훅
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/client';

import type { QAResponse, HealthStatus } from '../types';

// Query Keys
export const queryKeys = {
  health: ['health'] as const,
  history: (sessionId?: string) => ['history', sessionId] as const,
  dashboard: {
    summary: ['dashboard', 'summary'] as const,
    daily: ['dashboard', 'daily'] as const,
    categories: ['dashboard', 'categories'] as const,
  },
};

/**
 * Health Check Hook (alias for useHealth)
 */
export function useServerStatus() {
  return useQuery<HealthStatus>({
    queryKey: queryKeys.health,
    queryFn: api.getHealth,
    refetchInterval: 60000,
    retry: 3,
  });
}

/**
 * Health Check Hook
 */
export function useHealth() {
  return useServerStatus();
}

/**
 * Ask Question Mutation
 */
export function useAskQuestion() {
  const queryClient = useQueryClient();

  return useMutation<QAResponse, Error, string>({
    mutationFn: (question: string) => api.askQuestion(question),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

/**
 * History Hook
 */
export function useHistory(limit = 50, sessionId?: string) {
  return useQuery({
    queryKey: queryKeys.history(sessionId),
    queryFn: () => api.getHistory(limit, sessionId),
    staleTime: 30000, // 30초
  });
}

/**
 * Dashboard Summary Hook
 */
export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.dashboard.summary,
    queryFn: api.getDashboardSummary,
    staleTime: 60000, // 1분
  });
}

/**
 * Daily Stats Hook
 */
export function useDailyStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.daily,
    queryFn: api.getDailyStats,
    staleTime: 60000,
  });
}

/**
 * Category Stats Hook
 */
export function useCategoryStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.categories,
    queryFn: api.getCategoryStats,
    staleTime: 60000,
  });
}