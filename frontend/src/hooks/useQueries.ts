/**
 * TanStack Query Hooks
 * 서버 상태 및 비동기 데이터 관리
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/client';
import type { AskRequest } from '../types';

// Query Keys
export const queryKeys = {
  history: ['history'] as const,
  historySearch: (search: string, category: string) => 
    ['history', { search, category }] as const,
  record: (id: string) => ['record', id] as const,
  dashboardSummary: ['dashboard', 'summary'] as const,
  dailyStats: (startDate?: string, endDate?: string) => 
    ['dashboard', 'daily', { startDate, endDate }] as const,
  categoryDistribution: ['dashboard', 'categories'] as const,
  sourceContribution: ['dashboard', 'sources'] as const,
  serverHealth: ['health'] as const,
};

/**
 * 질문 전송 Mutation
 */
export function useAskQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: AskRequest) => api.askQuestion(request),
    onSuccess: () => {
      // 질문 성공 시 이력 갱신
      queryClient.invalidateQueries({ queryKey: queryKeys.history });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
    },
  });
}

/**
 * 질문 이력 조회
 */
export function useQAHistory(params?: {
  search?: string;
  category?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: params?.search || params?.category 
      ? queryKeys.historySearch(params.search || '', params.category || '')
      : queryKeys.history,
    queryFn: () => api.getQAHistory(params),
    staleTime: 1000 * 60, // 1분
  });
}

/**
 * 특정 질문 기록 조회
 */
export function useQARecord(id: string | null) {
  return useQuery({
    queryKey: queryKeys.record(id || ''),
    queryFn: () => api.getQARecord(id!),
    enabled: !!id,
  });
}

/**
 * 대시보드 요약 통계
 */
export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.dashboardSummary,
    queryFn: api.getDashboardSummary,
    staleTime: 1000 * 30, // 30초
    refetchInterval: 1000 * 60, // 1분마다 자동 갱신
  });
}

/**
 * 일별 통계
 */
export function useDailyStats(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: queryKeys.dailyStats(startDate, endDate),
    queryFn: () => api.getDailyStats({ startDate, endDate }),
    staleTime: 1000 * 60 * 5, // 5분
  });
}

/**
 * 질문 유형 분포
 */
export function useCategoryDistribution() {
  return useQuery({
    queryKey: queryKeys.categoryDistribution,
    queryFn: api.getCategoryDistribution,
    staleTime: 1000 * 60 * 5, // 5분
  });
}

/**
 * 데이터 소스 기여도
 */
export function useSourceContribution() {
  return useQuery({
    queryKey: queryKeys.sourceContribution,
    queryFn: api.getSourceContribution,
    staleTime: 1000 * 60 * 5, // 5분
  });
}

/**
 * 서버 상태 확인
 */
export function useServerHealth() {
  return useQuery({
    queryKey: queryKeys.serverHealth,
    queryFn: api.checkServerHealth,
    staleTime: 1000 * 10, // 10초
    refetchInterval: 1000 * 30, // 30초마다 자동 갱신
    retry: 1,
  });
}

