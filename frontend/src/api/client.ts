/**
 * API 클라이언트
 * 백엔드 서버와의 통신을 담당
 */
import type { 
  AskRequest, 
  AskResponse, 
  QARecord, 
  DashboardSummary,
  DailyStats,
  CategoryDistribution,
  SourceContribution
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * API 요청 헬퍼
 */
async function apiRequest<T>(
  endpoint: string, 
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * 질문 전송 및 답변 받기
 */
export async function askQuestion(request: AskRequest): Promise<AskResponse> {
  return apiRequest<AskResponse>('/api/ask', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * 질문 이력 조회
 */
export async function getQAHistory(params?: {
  search?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<QARecord[]> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.category) searchParams.set('category', params.category);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const query = searchParams.toString();
  return apiRequest<QARecord[]>(`/api/history${query ? `?${query}` : ''}`);
}

/**
 * 특정 질문 기록 조회
 */
export async function getQARecord(id: string): Promise<QARecord> {
  return apiRequest<QARecord>(`/api/history/${id}`);
}

/**
 * 대시보드 요약 통계 조회
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>('/api/dashboard/summary');
}

/**
 * 일별 통계 조회
 */
export async function getDailyStats(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<DailyStats[]> {
  const searchParams = new URLSearchParams();
  if (params?.startDate) searchParams.set('startDate', params.startDate);
  if (params?.endDate) searchParams.set('endDate', params.endDate);

  const query = searchParams.toString();
  return apiRequest<DailyStats[]>(`/api/dashboard/daily${query ? `?${query}` : ''}`);
}

/**
 * 질문 유형 분포 조회
 */
export async function getCategoryDistribution(): Promise<CategoryDistribution[]> {
  return apiRequest<CategoryDistribution[]>('/api/dashboard/categories');
}

/**
 * 데이터 소스 기여도 조회
 */
export async function getSourceContribution(): Promise<SourceContribution[]> {
  return apiRequest<SourceContribution[]>('/api/dashboard/sources');
}

/**
 * 서버 상태 확인
 */
export async function checkServerHealth(): Promise<{ status: string; timestamp: string }> {
  return apiRequest<{ status: string; timestamp: string }>('/api/health');
}

