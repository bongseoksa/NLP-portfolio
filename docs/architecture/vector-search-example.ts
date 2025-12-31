/**
 * Serverless 벡터 검색 예시 코드
 * 
 * 이 파일은 SERVERLESS-VECTOR-SEARCH.md 문서의 코드 예시입니다.
 * 실제 프로젝트에서는 src/service/vector-store/fileVectorStore.ts를 참고하세요.
 */

// ============================================================================
// 1. 코사인 유사도 계산 함수
// ============================================================================

/**
 * 코사인 유사도 계산 (기본 구현)
 * 
 * @param vecA 첫 번째 벡터 (쿼리 임베딩)
 * @param vecB 두 번째 벡터 (저장된 임베딩)
 * @returns 유사도 점수 (0 ~ 1, 1에 가까울수록 유사)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    // 벡터 차원 검증
    if (vecA.length !== vecB.length) {
        throw new Error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
    }

    let dotProduct = 0;  // 내적 (A · B)
    let normA = 0;       // ||A||²
    let normB = 0;       // ||B||²

    // 벡터 연산 (단일 루프로 최적화)
    for (let i = 0; i < vecA.length; i++) {
        const a = vecA[i];
        const b = vecB[i];
        
        if (a !== undefined && b !== undefined) {
            dotProduct += a * b;
            normA += a * a;
            normB += b * b;
        }
    }

    // 분모 계산 (||A|| × ||B||)
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);

    // 0으로 나누기 방지
    if (denominator === 0) {
        return 0;
    }

    // 코사인 유사도 반환
    return dotProduct / denominator;
}

// ============================================================================
// 2. 벡터 검색 함수 (간단한 예시)
// ============================================================================

interface Vector {
    id: string;
    embedding: number[];
    content: string;
    metadata: Record<string, any>;
}

interface SearchResult {
    id: string;
    content: string;
    metadata: Record<string, any>;
    score: number;
}

/**
 * 벡터 배열에서 검색 수행
 * 
 * @param queryEmbedding 쿼리 임베딩 벡터
 * @param vectors 검색할 벡터 배열
 * @param topK 상위 K개 결과 반환
 * @param threshold 최소 유사도 임계값
 * @returns 검색 결과 배열
 */
export function searchVectors(
    queryEmbedding: number[],
    vectors: Vector[],
    topK: number = 5,
    threshold: number = 0.0
): SearchResult[] {
    const similarities: Array<{ id: string; score: number; data: Vector }> = [];

    // 모든 벡터에 대해 유사도 계산
    for (const vec of vectors) {
        const score = cosineSimilarity(queryEmbedding, vec.embedding);

        // 임계값 이상인 경우만 추가
        if (score >= threshold) {
            similarities.push({ id: vec.id, score, data: vec });
        }
    }

    // 유사도 점수 내림차순 정렬
    similarities.sort((a, b) => b.score - a.score);

    // 상위 K개 선택
    const topResults = similarities.slice(0, topK);

    // SearchResult 형식으로 변환
    return topResults.map(result => ({
        id: result.data.id,
        content: result.data.content,
        metadata: result.data.metadata,
        score: result.score
    }));
}

// ============================================================================
// 3. 코드 + 히스토리 동시 검색
// ============================================================================

interface CodeVector extends Vector {
    metadata: {
        type: "commit" | "diff" | "file";
        sha?: string;
        path?: string;
        // ... 기타 코드 메타데이터
    };
}

interface HistoryVector extends Vector {
    metadata: {
        type: "question" | "answer";
        question?: string;
        answer?: string;
        // ... 기타 히스토리 메타데이터
    };
}

/**
 * 코드 임베딩 + 히스토리 임베딩 동시 검색
 * 
 * @param queryEmbedding 쿼리 임베딩 벡터
 * @param codeVectors 코드 벡터 배열
 * @param historyVectors 히스토리 벡터 배열
 * @param topK 상위 K개 결과 반환
 * @returns 검색 결과 배열 (코드 + 히스토리 혼합)
 */
export function searchMixedVectors(
    queryEmbedding: number[],
    codeVectors: CodeVector[],
    historyVectors: HistoryVector[],
    topK: number = 5
): SearchResult[] {
    // 각각에서 Top-K/2 개씩 검색
    const codeK = Math.ceil(topK / 2);
    const historyK = Math.floor(topK / 2);

    // 코드 벡터 검색
    const codeResults = searchVectors(queryEmbedding, codeVectors, codeK, 0.0);

    // 히스토리 벡터 검색
    const historyResults = searchVectors(queryEmbedding, historyVectors, historyK, 0.0);

    // 결과 병합 및 재정렬
    const mixedResults = [...codeResults, ...historyResults]
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

    return mixedResults;
}

// ============================================================================
// 4. 사용 예시
// ============================================================================

/**
 * 사용 예시
 */
export function example() {
    // 쿼리 임베딩 (예: OpenAI API로 생성)
    const queryEmbedding = [0.1, 0.2, 0.3, /* ... 1536차원 */];

    // 코드 벡터 예시
    const codeVectors: CodeVector[] = [
        {
            id: "commit-abc123",
            embedding: [0.15, 0.18, 0.32, /* ... */],
            content: "feat: Add new feature",
            metadata: {
                type: "commit",
                sha: "abc123"
            }
        },
        {
            id: "file-xyz789",
            embedding: [0.12, 0.25, 0.28, /* ... */],
            content: "src/index.ts: export function main() {...}",
            metadata: {
                type: "file",
                path: "src/index.ts"
            }
        }
    ];

    // 히스토리 벡터 예시
    const historyVectors: HistoryVector[] = [
        {
            id: "qa-001",
            embedding: [0.11, 0.19, 0.31, /* ... */],
            content: "Q: 프로젝트 구조는? A: ...",
            metadata: {
                type: "question",
                question: "프로젝트 구조는?"
            }
        }
    ];

    // 1. 단일 벡터 검색
    const singleResults = searchVectors(queryEmbedding, codeVectors, 5);
    console.log("Single search results:", singleResults);

    // 2. 혼합 검색 (코드 + 히스토리)
    const mixedResults = searchMixedVectors(
        queryEmbedding,
        codeVectors,
        historyVectors,
        5
    );
    console.log("Mixed search results:", mixedResults);

    // 3. 코사인 유사도 직접 계산
    const similarity = cosineSimilarity(
        queryEmbedding,
        codeVectors[0].embedding
    );
    console.log("Similarity:", similarity);
}

