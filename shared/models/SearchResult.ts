/**
 * Search Result Types
 * 벡터 검색 및 Q&A 응답 타입 정의
 */

export interface SearchResult {
  id: string;
  type: 'commit' | 'file' | 'qa';
  content: string;
  metadata: Record<string, any>;
  score: number;
}

export interface QAResponse {
  answer: string;
  sources: SearchResult[];
  processingTime: number;
  status: 'success' | 'partial' | 'failed';
}

export interface QARequest {
  question: string;
  sessionId?: string;
  topK?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  vectorStore?: {
    type: string;
    totalVectors: number;
    commitCount: number;
    fileCount: number;
    qaCount: number;
  };
  error?: string;
}
