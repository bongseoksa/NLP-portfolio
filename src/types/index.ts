/**
 * Frontend Type Definitions
 */

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
  status: 'success' | 'partial' | 'failed';
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

// Dashboard Types
export interface DashboardSummary {
  totalQuestions: number;
  successRate: number;
  avgResponseTime: number;
  totalVectors: number;
}

export interface DailyStats {
  date: string;
  count: number;
}

export interface CategoryStats {
  category: string;
  count: number;
  percentage: number;
}
