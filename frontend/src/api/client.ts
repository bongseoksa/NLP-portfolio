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
    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
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

    return response.json();
  } catch (error: unknown) {
    // 네트워크 오류 (연결 거부 등)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      if (silent) {
        // 조용한 모드: null 반환
        return null as T;
      }
      // 일반 모드: 에러 throw
      throw new Error(`API 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요. (${baseUrl})`);
    }
    // 기타 오류
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
  return apiRequest<AskResponse>('/api/ask', {
    method: 'POST',
    body: JSON.stringify(request),
  }, API_BASE_URL, false); // 실제 작업이므로 에러 throw
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
// Control Server 엔드포인트 (로컬 개발용)
// ============================================

export interface ServerStatus {
  chromadb: {
    status: 'stopped' | 'starting' | 'running' | 'error';
    startedAt: string | null;
    pid: number | null;
  };
  api: {
    status: 'stopped' | 'starting' | 'running' | 'error';
    startedAt: string | null;
    pid: number | null;
  };
}

export interface ControlResponse {
  success: boolean;
  message: string;
}

/**
 * 모든 서버 상태 조회
 */
export async function getServerStatus(): Promise<ServerStatus | null> {
  try {
    return await apiRequest<ServerStatus>('/control/status', undefined, CONTROL_BASE_URL, true);
  } catch {
    return null;
  }
}

/**
 * ChromaDB 서버 시작
 */
export async function startChromaDB(): Promise<ControlResponse> {
  return apiRequest<ControlResponse>('/control/chromadb/start', { method: 'POST' }, CONTROL_BASE_URL, false);
}

/**
 * ChromaDB 서버 종료
 */
export async function stopChromaDB(): Promise<ControlResponse> {
  return apiRequest<ControlResponse>('/control/chromadb/stop', { method: 'POST' }, CONTROL_BASE_URL, false);
}

/**
 * API 서버 시작
 */
export async function startAPIServer(): Promise<ControlResponse> {
  return apiRequest<ControlResponse>('/control/api/start', { method: 'POST' }, CONTROL_BASE_URL, false);
}

/**
 * API 서버 종료
 */
export async function stopAPIServer(): Promise<ControlResponse> {
  return apiRequest<ControlResponse>('/control/api/stop', { method: 'POST' }, CONTROL_BASE_URL, false);
}

/**
 * 서버 로그 조회
 */
export async function getServerLogs(server: 'chromadb' | 'api'): Promise<{ logs: string[] } | null> {
  try {
    return await apiRequest<{ logs: string[] }>(`/control/logs/${server}`, undefined, CONTROL_BASE_URL, true);
  } catch {
    return null;
  }
}

/**
 * Control 서버 연결 상태 확인
 */
export async function checkControlServerHealth(): Promise<boolean> {
  try {
    await getServerStatus();
    return true;
  } catch {
    return false;
  }
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
