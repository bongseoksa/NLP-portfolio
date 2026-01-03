/**
 * 임베딩 아이템 (벡터 저장용)
 */
export interface EmbeddingItem {
    /** 고유 ID */
    id: string;
    /** 타입 (commit | file | qa) */
    type: 'commit' | 'file' | 'qa';
    /** 원본 텍스트 */
    content: string;
    /** 임베딩 벡터 (384 차원 - Hugging Face all-MiniLM-L6-v2) */
    embedding: number[];
    /** 메타데이터 */
    metadata: Record<string, any>;
}
