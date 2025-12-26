/**
 * 프론트엔드 타입 정의
 */

// 질문 유형 분류
export type QuestionCategory = 
  | 'planning'    // 기획
  | 'technical'   // 기술
  | 'history'     // 히스토리
  | 'cs'          // CS (고객 서비스/문의)
  | 'status';     // 현황

// 응답 상태
export type ResponseStatus = 
  | 'success'     // 정상 응답
  | 'partial'     // 부분 응답 (근거 부족)
  | 'failed';     // 응답 실패 (관련 데이터 없음)

// 근거 정보
export interface Source {
  type: 'code' | 'commit' | 'history';
  filePath?: string;
  commitHash?: string;
  commitMessage?: string;
  relevanceScore: number;
}

// 질문-응답 기록
export interface QARecord {
  id: string;
  question: string;
  questionSummary: string;        // 20자 이내 요약
  answer: string;
  category: QuestionCategory;
  categoryConfidence: number;     // 0-1 신뢰도
  sources: Source[];
  status: ResponseStatus;
  responseTimeMs: number;
  tokenUsage: number;
  createdAt: string;
}

// 대시보드 요약 통계
export interface DashboardSummary {
  totalQuestions: number;
  successRate: number;
  failureRate: number;
  averageResponseTimeMs: number;
  dailyTokenUsage: number;
  totalTokenUsage: number;
  serverStatus: 'online' | 'offline';
  lastSuccessfulResponse: string;
}

// 일별 질의 통계
export interface DailyStats {
  date: string;
  questionCount: number;
  successCount: number;
  failureCount: number;
  averageResponseTimeMs: number;
}

// 질문 유형 분포
export interface CategoryDistribution {
  category: QuestionCategory;
  count: number;
  percentage: number;
}

// 데이터 소스 기여도
export interface SourceContribution {
  type: 'code' | 'commit' | 'history';
  count: number;
  percentage: number;
}

// API 요청 타입
export interface AskRequest {
  question: string;
  sessionId?: string; // 대화 세션 ID (연속 대화용)
}

// API 응답 타입
export interface AskResponse {
  answer: string;
  sources: Source[];
  category: QuestionCategory;
  categoryConfidence: number;
  status: ResponseStatus;
  responseTimeMs: number;
  tokenUsage: number;
  sessionId: string; // 세션 ID 반환
}

