/**
 * 벡터 검색 결과 (공통 인터페이스)
 * ChromaDB와 Supabase 모두 이 타입을 반환
 */
export interface SearchResult {
    /** 문서 고유 ID */
    id: string;
    /** 문서 내용 */
    content: string;
    /** 메타데이터 */
    metadata: Record<string, any>;
    /** 유사도 점수 (0-1, 높을수록 유사) */
    score: number;
}
