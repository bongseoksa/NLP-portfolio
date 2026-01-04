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

// API Base URL 설정
// - 로컬 개발: http://localhost:3001 (Express 서버)
// - Vercel 배포 (같은 프로젝트): 빈 문자열 또는 설정 안 함 (상대 경로 /api/* 사용)
// - Vercel 배포 (별도 프로젝트): https://your-api-project.vercel.app
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const CONTROL_BASE_URL = import.meta.env.VITE_CONTROL_URL || 'http://localhost:3000';

/**
 * API 요청 헬퍼
 * @param silent true: 네트워크 오류를 조용히 처리하고 null 반환 (상태 확인용)
 *               false: 모든 오류를 throw (실제 작업용)
 */
async function apiRequest<T>(
  endpoint: string, 
  options?: RequestInit,
  baseUrl: string = API_BASE_URL,
  silent: boolean = false
): Promise<T> {
  try {
    // headers 병합 (기본 Content-Type 유지)
    const headers = new Headers({
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    });

    // Vercel 배포 시 같은 프로젝트에 있으면 상대 경로 사용
    // baseUrl이 빈 문자열이거나 endpoint가 이미 절대 경로인 경우 처리
    const url = baseUrl && baseUrl.trim() && !endpoint.startsWith('http') 
      ? `${baseUrl}${endpoint}` 
      : endpoint.startsWith('http') 
        ? endpoint 
        : endpoint; // 상대 경로 사용 (같은 도메인)
    
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = new Error(`API Error: ${response.status} ${response.statusText}`);
      if (silent) {
        // 조용한 모드: null 반환
        return null as T;
      }
      // 일반 모드: 에러 throw
      throw error;
    }

    const data = await response.json();
    return data;
  } catch (error: unknown) {
    // 네트워크 오류 (연결 거부 등)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('[API] Network error:', error);
      if (silent) {
        // 조용한 모드: null 반환
        return null as T;
      }
      // 일반 모드: 에러 throw
      throw new Error(`API 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요. (${baseUrl})`);
    }
    // JSON 파싱 오류
    if (error instanceof SyntaxError) {
      console.error('[API] JSON parse error:', error);
      if (silent) {
        return null as T;
      }
      throw new Error('서버 응답을 파싱할 수 없습니다.');
    }
    // 기타 오류
    console.error('[API] Unknown error:', error);
    if (silent) {
      return null as T;
    }
    throw error;
  }
}

// ============================================
// API Server 엔드포인트
// ============================================

/**
 * 질문 전송 및 답변 받기
 */
export async function askQuestion(request: AskRequest): Promise<AskResponse> {
  console.log('[API] 질문 전송:', request);
  try {
    const response = await apiRequest<AskResponse>('/api/ask', {
      method: 'POST',
      body: JSON.stringify(request),
    }, API_BASE_URL, false); // 실제 작업이므로 에러 throw
    console.log('[API] 질문 응답:', response);
    return response;
  } catch (error) {
    console.error('[API] 질문 전송 실패:', error);
    throw error;
  }
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
  try {
    const result = await apiRequest<QARecord[]>(`/api/history${query ? `?${query}` : ''}`, undefined, API_BASE_URL, true);
    return result || [];
  } catch {
    // API 서버가 없을 때는 빈 배열 반환
    return [];
  }
}

/**
 * 세션별 대화 이력 조회
 */
export async function getSessionHistory(sessionId: string): Promise<QARecord[]> {
  try {
    const result = await apiRequest<QARecord[]>(`/api/history/session/${sessionId}`, undefined, API_BASE_URL, false);
    return result || [];
  } catch (error) {
    console.error('Failed to load session history:', error);
    throw error;
  }
}

/**
 * 특정 질문 기록 조회
 */
export async function getQARecord(id: string): Promise<QARecord | null> {
  try {
    return await apiRequest<QARecord>(`/api/history/${id}`, undefined, API_BASE_URL, true);
  } catch {
    return null;
  }
}

/**
 * 대시보드 요약 통계 조회
 */
export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  try {
    return await apiRequest<DashboardSummary>('/api/dashboard/summary', undefined, API_BASE_URL, true);
  } catch {
    return null;
  }
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
  try {
    const result = await apiRequest<DailyStats[]>(`/api/dashboard/daily${query ? `?${query}` : ''}`, undefined, API_BASE_URL, true);
    return result || [];
  } catch {
    return [];
  }
}

/**
 * 질문 유형 분포 조회
 */
export async function getCategoryDistribution(): Promise<CategoryDistribution[]> {
  try {
    const result = await apiRequest<CategoryDistribution[]>('/api/dashboard/categories', undefined, API_BASE_URL, true);
    return result || [];
  } catch {
    return [];
  }
}

/**
 * 데이터 소스 기여도 조회
 */
export async function getSourceContribution(): Promise<SourceContribution[]> {
  try {
    const result = await apiRequest<SourceContribution[]>('/api/dashboard/sources', undefined, API_BASE_URL, true);
    return result || [];
  } catch {
    return [];
  }
}

/**
 * API 서버 상태 확인
 */
export async function checkAPIServerHealth(): Promise<{ status: string; timestamp: string } | null> {
  try {
    return await apiRequest<{ status: string; timestamp: string }>('/api/health', undefined, API_BASE_URL, true);
  } catch {
    return null;
  }
}


// ============================================
// 서버 상태 조회
// ============================================

export interface ServerStatus {
  api: {
    status: 'stopped' | 'starting' | 'running' | 'error';
    startedAt: string | null;
    pid: number | null;
  };
  supabase?: {
    status: 'connected' | 'disconnected';
  };
}

// 서버 상태 캐시
let serverStatusCache: {
  data: ServerStatus | null;
  timestamp: number;
  pending: Promise<ServerStatus | null> | null;
} = {
  data: null,
  timestamp: 0,
  pending: null,
};
const STATUS_CACHE_TTL = 1000 * 60; // 1분 캐시

/**
 * 모든 서버 상태 조회 (중복 호출 방지 및 캐싱)
 */
export async function getServerStatus(): Promise<ServerStatus | null> {
  const now = Date.now();

  // 캐시가 유효하면 반환
  if (serverStatusCache.data && (now - serverStatusCache.timestamp) < STATUS_CACHE_TTL) {
    return serverStatusCache.data;
  }

  // 이미 요청 중이면 기존 요청 반환 (중복 호출 방지)
  if (serverStatusCache.pending) {
    return serverStatusCache.pending;
  }

  // 새로운 요청 생성
  serverStatusCache.pending = (async () => {
    try {
      const result = await apiRequest<ServerStatus>('/api/health/status', undefined, API_BASE_URL, true);
      if (result) {
        serverStatusCache.data = result;
        serverStatusCache.timestamp = now;
      }
      return result;
    } catch {
      return null;
    } finally {
      serverStatusCache.pending = null;
    }
  })();

  return serverStatusCache.pending;
}

/**
 * 서버 상태 캐시 무효화
 */
export function invalidateServerStatusCache(): void {
  serverStatusCache = {
    data: null,
    timestamp: 0,
    pending: null,
  };
}

/**
 * 마이그레이션 상태 확인
 */
export async function checkMigrationStatus(): Promise<{
  qa_history: boolean;
  server_status_log: boolean;
  allTablesExist: boolean;
} | null> {
  try {
    return await apiRequest<{
      qa_history: boolean;
      server_status_log: boolean;
      allTablesExist: boolean;
    }>('/api/migration/status', undefined, API_BASE_URL, true);
  } catch {
    return null;
  }
}

/**
 * 마이그레이션 스키마 조회
 */
export async function getMigrationSchema(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/migration/schema`);
    if (!response.ok) {
      return null;
    }
    return response.text();
  } catch {
    return null;
  }
}
