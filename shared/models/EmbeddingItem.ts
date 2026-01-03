/**
 * 임베딩 아이템 (벡터 저장용)
 */
export interface EmbeddingItem {
    /** 고유 ID */
    id: string;
    /** 원본 텍스트 */
    content: string;
    /** 임베딩 벡터 (1536 차원 - OpenAI text-embedding-3-small) */
    embedding: number[];
    /** 메타데이터 */
    metadata: Record<string, any>;
}
