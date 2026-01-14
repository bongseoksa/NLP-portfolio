/**
 * Frontend Type Definitions
 */

// Question Category Types
export type QuestionCategory =
  | 'planning'
  | 'technical'
  | 'history'
  | 'cs'
  | 'status'
  | 'issue'
  | 'implementation'
  | 'structure'
  | 'data'
  | 'techStack'
  | 'testing'
  | 'summary'
  | 'etc';

// Response Status
export type ResponseStatus = 'success' | 'partial' | 'failed';

// API Response Types
export interface SearchResult {
  id: string;
  type: 'commit' | 'file' | 'qa';
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

export interface QAResponse {
  answer: string;
  sources: SearchResult[];
  processingTime: number;
  status: ResponseStatus;
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

// UI State Types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  timestamp: Date;
  status?: 'loading' | 'success' | 'error';
}

export interface QASession {
  id: string;
  messages: Message[];
  createdAt: Date;
}

// Q&A Record (from database)
export interface QARecord {
  id: string;
  sessionId?: string;
  question: string;
  questionSummary?: string;
  answer: string;
  category?: QuestionCategory;
  categoryConfidence?: number;
  sources?: SearchResult[];
  status: ResponseStatus;
  responseTimeMs?: number;
  classificationTimeMs?: number;
  vectorSearchTimeMs?: number;
  llmGenerationTimeMs?: number;
  dbSaveTimeMs?: number;
  tokenUsage?: number;
  promptTokens?: number;
  completionTokens?: number;
  embeddingTokens?: number;
  llmProvider?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// Dashboard Types
export interface DashboardSummary {
  totalQuestions: number;
  successRate: number;
  averageResponseTimeMs: number;
  serverStatus: 'online' | 'offline';
}

export interface DailyStats {
  date: string;
  questionCount: number;
  successCount: number;
  failureCount: number;
}

export interface CategoryDistribution {
  category: string;
  count: number;
  percentage: number;
  [key: string]: string | number;
}

export interface SourceContribution {
  type: 'code' | 'commit' | 'history';
  count: number;
  percentage: number;
  [key: string]: string | number;
}
