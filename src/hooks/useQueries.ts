/**
 * TanStack Query Hooks
 * 서버 상태 관리 훅
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/client';

import type {
  QAResponse,
  HealthStatus,
  QARecord,
  DashboardSummary,
  DailyStats,
  CategoryDistribution,
  SourceContribution,
} from '../types';

// Query Keys
export const queryKeys = {
  health: ['health'] as const,
  history: (params?: { limit?: number; sessionId?: string }) =>
    ['history', params] as const,
  dashboard: {
    summary: ['dashboard', 'summary'] as const,
    daily: ['dashboard', 'daily'] as const,
    categories: ['dashboard', 'categories'] as const,
    sources: ['dashboard', 'sources'] as const,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
    },
  });
}

/**
 * History Hook
 */
export function useHistory(params?: { limit?: number; sessionId?: string }) {
  return useQuery<QARecord[]>({
    queryKey: queryKeys.history(params),
    queryFn: () => api.getHistory(params),
    staleTime: 30000, // 30초
  });
}

/**
 * Dashboard Summary Hook
 */
export function useDashboardSummary() {
  return useQuery<DashboardSummary | null>({
    queryKey: queryKeys.dashboard.summary,
    queryFn: api.getDashboardSummary,
    staleTime: 30000, // 30초
    refetchInterval: 60000, // 1분마다 자동 갱신
  });
}

/**
 * Daily Stats Hook
 */
export function useDailyStats() {
  return useQuery<DailyStats[]>({
    queryKey: queryKeys.dashboard.daily,
    queryFn: api.getDailyStats,
    staleTime: 300000, // 5분
  });
}

/**
 * Category Distribution Hook
 */
export function useCategoryDistribution() {
  return useQuery<CategoryDistribution[]>({
    queryKey: queryKeys.dashboard.categories,
    queryFn: api.getCategoryDistribution,
    staleTime: 300000, // 5분
  });
}

/**
 * Source Contribution Hook
 */
export function useSourceContribution() {
  return useQuery<SourceContribution[]>({
    queryKey: queryKeys.dashboard.sources,
    queryFn: api.getSourceContribution,
    staleTime: 300000, // 5분
  });
}
