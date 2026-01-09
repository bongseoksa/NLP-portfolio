/**
 * Embedding Item Types
 * 벡터 저장소에서 사용하는 임베딩 아이템 타입 정의
 */

export interface EmbeddingItem {
  id: string;
  type: 'commit' | 'file' | 'qa';
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
}

export interface VectorFile {
  version: string;
  exportedAt: string;
  statistics: {
    totalVectors: number;
    commitCount: number;
    fileCount: number;
    qaCount: number;
  };
  vectors: EmbeddingItem[];
}

export interface CommitMetadata {
  type: 'commit';
  sha: string;
  author: string;
  date: string;
  message: string;
  repository: string;
}

export interface FileMetadata {
  type: 'file';
  path: string;
  fileType: string;
  size: number;
  extension: string;
  chunkIndex?: number;
  totalChunks?: number;
}

export interface QAMetadata {
  type: 'qa';
  question: string;
  timestamp: string;
  sessionId?: string;
}
