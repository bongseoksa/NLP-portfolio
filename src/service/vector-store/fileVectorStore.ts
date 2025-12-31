/**
 * 파일 기반 벡터 스토어 (Serverless 환경용)
 *
 * ChromaDB 서버 없이 정적 파일에서 벡터를 로딩하여 메모리에서 검색
 * - 서버 비용 0원
 * - Cold Start: 100-300ms (파일 다운로드)
 * - Warm Start: 10-30ms (메모리 캐시)
 */

import type { SearchResult } from "../../shared/models/SearchResult.js";
import { promisify } from "util";
import { gunzip } from "zlib";

const gunzipAsync = promisify(gunzip);

interface VectorData {
    id: string;
    embedding: number[];
    content: string;
    metadata: Record<string, any>;
}

interface VectorIndex {
    version: string;
    dimension: number;
    count: number;
    createdAt: string;
    metadata: {
        owner: string;
        repo: string;
    };
    vectors: VectorData[];
}

// 메모리 캐시 (Lambda/Vercel 재사용)
let cachedIndex: VectorIndex | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

/**
 * 벡터 파일 로딩 (메모리 캐싱)
 */
async function loadVectorIndex(): Promise<VectorIndex> {
    const now = Date.now();

    // 캐시 유효성 검사
    if (cachedIndex && (now - cacheTimestamp) < CACHE_TTL_MS) {
        console.log("✅ Using cached vector index");
        return cachedIndex;
    }

    console.log("📥 Loading vector index from file...");
    const startTime = Date.now();

    // 환경 변수로 파일 URL 지정
    const vectorFileUrl = process.env.VECTOR_FILE_URL ||
                          process.env.VERCEL_BLOB_URL ||
                          "https://your-cdn.com/embeddings.json.gz";

    try {
        const response = await fetch(vectorFileUrl, {
            headers: {
                'Accept-Encoding': 'gzip'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch vector file: ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // gzip 압축 해제 (파일이 .gz로 끝나는 경우)
        let jsonString: string;
        if (vectorFileUrl.endsWith('.gz')) {
            const decompressed = await gunzipAsync(buffer);
            jsonString = decompressed.toString('utf-8');
        } else {
            jsonString = buffer.toString('utf-8');
        }

        const index: VectorIndex = JSON.parse(jsonString);

        // 캐시 업데이트
        cachedIndex = index;
        cacheTimestamp = now;

        const loadTime = Date.now() - startTime;
        console.log(`✅ Loaded ${index.count} vectors (${index.dimension}D) in ${loadTime}ms`);

        return index;

    } catch (error: any) {
        console.error("❌ Failed to load vector index:", error.message);
        throw new Error(`Vector file loading failed: ${error.message}`);
    }
}

/**
 * 코사인 유사도 계산
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        const a = vecA[i];
        const b = vecB[i];
        if (a !== undefined && b !== undefined) {
            dotProduct += a * b;
            normA += a * a;
            normB += b * b;
        }
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);

    if (denominator === 0) {
        return 0;
    }

    return dotProduct / denominator;
}

/**
 * 파일 기반 벡터 검색 (브루트포스)
 *
 * @param queryEmbedding 쿼리 임베딩 벡터 (이미 생성된 상태)
 * @param topK 상위 K개 결과 반환
 * @param options 검색 옵션
 * @returns 검색 결과
 */
export async function searchVectorsFromFile(
    queryEmbedding: number[],
    topK: number = 5,
    options?: {
        threshold?: number;
        filterMetadata?: Record<string, any>;
    }
): Promise<SearchResult[]> {
    const { threshold = 0.0, filterMetadata } = options || {};

    console.log("🔍 Searching vectors from file...");
    const searchStart = Date.now();

    // 1. 벡터 파일 로딩
    const index = await loadVectorIndex();

    // 2. 메타데이터 필터링 + 유사도 계산
    const similarities: Array<{ id: string; score: number; data: VectorData }> = [];

    for (const vec of index.vectors) {
        // 메타데이터 필터 적용
        if (filterMetadata) {
            const matches = Object.entries(filterMetadata).every(
                ([key, value]) => vec.metadata[key] === value
            );
            if (!matches) continue;
        }

        // 코사인 유사도 계산
        const score = cosineSimilarity(queryEmbedding, vec.embedding);

        if (score >= threshold) {
            similarities.push({ id: vec.id, score, data: vec });
        }
    }

    // 3. Top-K 추출 (내림차순 정렬)
    similarities.sort((a, b) => b.score - a.score);
    const topResults = similarities.slice(0, topK);

    const searchTime = Date.now() - searchStart;
    console.log(`   → Found ${topResults.length}/${similarities.length} results (search: ${searchTime}ms)`);

    // 4. SearchResult 형식으로 변환
    return topResults.map(result => ({
        id: result.data.id,
        content: result.data.content,
        metadata: result.data.metadata,
        score: result.score
    }));
}

/**
 * 캐시 강제 초기화 (테스트/디버깅용)
 */
export function clearVectorCache(): void {
    cachedIndex = null;
    cacheTimestamp = 0;
    console.log("🗑️  Vector cache cleared");
}

/**
 * 현재 캐시 상태 확인
 */
export function getCacheStatus(): { cached: boolean; age: number; count: number } {
    const age = cachedIndex ? Date.now() - cacheTimestamp : 0;
    return {
        cached: cachedIndex !== null,
        age,
        count: cachedIndex?.count || 0
    };
}
