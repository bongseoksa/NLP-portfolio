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

// 코드 임베딩 메타데이터
interface CodeMetadata {
    type: "commit" | "diff" | "file";
    // Commit 타입
    sha?: string;
    message?: string;
    author?: string;
    date?: string;
    affectedFiles?: string[];
    // Diff 타입
    commitId?: string;
    filePath?: string;
    additions?: number;
    deletions?: number;
    // File 타입
    path?: string;
    fileType?: string;
    extension?: string;
    size?: number;
    chunkIndex?: number;
    // 공통
    owner: string;
    repo: string;
    branch?: string;
}

// Q&A 히스토리 메타데이터
interface QAMetadata {
    type: "question" | "answer" | "conversation";
    // Question 타입
    question?: string;
    questionSummary?: string;
    category?: string;
    categoryConfidence?: number;
    // Answer 타입
    answer?: string;
    answerSummary?: string;
    // Conversation 타입
    conversationId?: string;
    sessionId?: string;
    sources?: string[];
    // 공통
    owner: string;
    repo: string;
    timestamp: string;
    responseTimeMs?: number;
    tokenUsage?: number;
}

interface Vector {
    id: string;
    type: "code" | "qa";
    embedding: number[];
    content: string;
    metadata: CodeMetadata | QAMetadata;
    createdAt: string;
    score?: number;
}

interface VectorFile {
    version: string;
    createdAt: string;
    repository: {
        owner: string;
        name: string;
        url: string;
    };
    embedding: {
        model: string;
        provider: string;
        dimension: number;
    };
    statistics: {
        totalVectors: number;
        codeVectors: number;
        qaVectors: number;
        fileSize: number;
        compressedSize: number;
    };
    index: {
        byType: {
            code: number[];
            qa: number[];
        };
        byCategory: {
            [category: string]: number[];
        };
    };
    vectors: Vector[];
}

// 하위 호환성을 위한 타입 (기존 파일 형식 지원)
interface LegacyVectorIndex {
    version: string;
    dimension: number;
    count: number;
    createdAt: string;
    metadata: {
        owner: string;
        repo: string;
    };
    vectors: Array<{
        id: string;
        embedding: number[];
        content: string;
        metadata: Record<string, any>;
    }>;
}

// 검색 모드 타입
export type SearchMode = "all" | "code" | "qa" | "mixed";

// 메모리 캐시 (Lambda/Vercel 재사용)
let cachedVectorFile: VectorFile | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

/**
 * 레거시 형식을 통합 스키마로 변환
 */
function convertLegacyToUnified(legacy: LegacyVectorIndex): VectorFile {
    const vectors: Vector[] = legacy.vectors.map((v, idx) => ({
        id: v.id,
        type: "code" as const,
        embedding: v.embedding,
        content: v.content,
        metadata: {
            type: v.metadata.type || "commit",
            owner: v.metadata.owner || legacy.metadata.owner,
            repo: v.metadata.repo || legacy.metadata.repo,
            ...v.metadata
        } as CodeMetadata,
        createdAt: v.metadata.createdAt || legacy.createdAt
    }));

    const codeIndices = vectors.map((_, idx) => idx);

    return {
        version: legacy.version,
        createdAt: legacy.createdAt,
        repository: {
            owner: legacy.metadata.owner,
            name: legacy.metadata.repo,
            url: `https://github.com/${legacy.metadata.owner}/${legacy.metadata.repo}`
        },
        embedding: {
            model: "text-embedding-3-small",
            provider: "openai",
            dimension: legacy.dimension
        },
        statistics: {
            totalVectors: legacy.count,
            codeVectors: legacy.count,
            qaVectors: 0,
            fileSize: 0,
            compressedSize: 0
        },
        index: {
            byType: {
                code: codeIndices,
                qa: []
            },
            byCategory: {}
        },
        vectors
    };
}

/**
 * 벡터 파일 로딩 (메모리 캐싱)
 */
async function loadVectorFile(): Promise<VectorFile> {
    const now = Date.now();

    // 캐시 유효성 검사
    if (cachedVectorFile && (now - cacheTimestamp) < CACHE_TTL_MS) {
        console.log("✅ Using cached vector file");
        return cachedVectorFile;
    }

    console.log("📥 Loading vector file from CDN...");
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

        const parsed = JSON.parse(jsonString);

        // 통합 스키마 vs 레거시 형식 자동 감지
        let vectorFile: VectorFile;
        if ('statistics' in parsed && 'index' in parsed) {
            // 통합 스키마 (v2.0.0+)
            vectorFile = parsed as VectorFile;
        } else {
            // 레거시 형식 (v1.x) - 자동 변환
            console.log("⚠️  Legacy format detected, converting to unified schema...");
            vectorFile = convertLegacyToUnified(parsed as LegacyVectorIndex);
        }

        // 캐시 업데이트
        cachedVectorFile = vectorFile;
        cacheTimestamp = now;

        const loadTime = Date.now() - startTime;
        console.log(`✅ Loaded ${vectorFile.statistics.totalVectors} vectors in ${loadTime}ms`);
        console.log(`   - Code: ${vectorFile.statistics.codeVectors}`);
        console.log(`   - Q&A: ${vectorFile.statistics.qaVectors}`);

        return vectorFile;

    } catch (error: any) {
        console.error("❌ Failed to load vector file:", error.message);
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
 * 질문 카테고리에 따라 검색 모드 자동 선택
 */
function determineSearchMode(category?: string): SearchMode {
    if (!category) return "all";

    const codeCategories = ["implementation", "tech_stack", "structure", "architecture"];
    const mixedCategories = ["usage", "explanation", "comparison", "history"];

    if (codeCategories.includes(category)) {
        return "code";
    } else if (mixedCategories.includes(category)) {
        return "mixed";
    } else {
        return "all";
    }
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
        mode?: SearchMode;
        category?: string;
        filterMetadata?: Record<string, any>;
    }
): Promise<SearchResult[]> {
    const {
        threshold = 0.0,
        mode: explicitMode,
        category,
        filterMetadata
    } = options || {};

    // 검색 모드 결정 (명시적 > 카테고리 기반 > 기본값)
    const mode = explicitMode || determineSearchMode(category) || "all";

    console.log(`🔍 Searching vectors (mode: ${mode})...`);
    const searchStart = Date.now();

    // 1. 벡터 파일 로딩
    const vectorFile = await loadVectorFile();

    // 2. 검색 모드에 따라 후보 벡터 선택
    let candidates: Vector[];

    switch (mode) {
        case "code":
            // 코드만 검색 (index 활용)
            candidates = vectorFile.index.byType.code.map(i => vectorFile.vectors[i]);
            break;

        case "qa":
            // Q&A만 검색 (index 활용)
            candidates = vectorFile.index.byType.qa.map(i => vectorFile.vectors[i]);
            break;

        case "mixed":
            // 코드 50% + Q&A 50% 혼합
            const codeVectors = vectorFile.index.byType.code.map(i => vectorFile.vectors[i]);
            const qaVectors = vectorFile.index.byType.qa.map(i => vectorFile.vectors[i]);

            const codeK = Math.ceil(topK / 2);
            const qaK = Math.floor(topK / 2);

            const codeResults = searchInVectors(codeVectors, queryEmbedding, codeK, threshold, filterMetadata);
            const qaResults = searchInVectors(qaVectors, queryEmbedding, qaK, threshold, filterMetadata);

            const mixedResults = [...codeResults, ...qaResults]
                .sort((a, b) => b.score - a.score)
                .slice(0, topK);

            const mixedTime = Date.now() - searchStart;
            console.log(`   → Found ${mixedResults.length} results (${codeResults.length} code + ${qaResults.length} qa) in ${mixedTime}ms`);

            return mixedResults;

        case "all":
        default:
            // 전체 검색 (스코어 기준 Top-K)
            candidates = vectorFile.vectors;
            break;
    }

    // 3. 유사도 계산 및 필터링
    const results = searchInVectors(candidates, queryEmbedding, topK, threshold, filterMetadata);

    const searchTime = Date.now() - searchStart;
    console.log(`   → Found ${results.length} results in ${searchTime}ms`);

    return results;
}

/**
 * 벡터 배열에서 검색 수행 (내부 헬퍼)
 */
function searchInVectors(
    vectors: Vector[],
    queryEmbedding: number[],
    topK: number,
    threshold: number = 0.0,
    filterMetadata?: Record<string, any>
): SearchResult[] {
    const similarities: Array<{ id: string; score: number; data: Vector }> = [];

    for (const vec of vectors) {
        // 메타데이터 필터 적용
        if (filterMetadata) {
            const matches = Object.entries(filterMetadata).every(
                ([key, value]) => (vec.metadata as any)[key] === value
            );
            if (!matches) continue;
        }

        // 코사인 유사도 계산
        const score = cosineSimilarity(queryEmbedding, vec.embedding);

        if (score >= threshold) {
            similarities.push({ id: vec.id, score, data: vec });
        }
    }

    // Top-K 추출 (내림차순 정렬)
    similarities.sort((a, b) => b.score - a.score);
    const topResults = similarities.slice(0, topK);

    // SearchResult 형식으로 변환
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
    cachedVectorFile = null;
    cacheTimestamp = 0;
    console.log("🗑️  Vector cache cleared");
}

/**
 * 현재 캐시 상태 확인
 */
export function getCacheStatus(): {
    cached: boolean;
    age: number;
    totalVectors: number;
    codeVectors: number;
    qaVectors: number;
} {
    const age = cachedVectorFile ? Date.now() - cacheTimestamp : 0;
    return {
        cached: cachedVectorFile !== null,
        age,
        totalVectors: cachedVectorFile?.statistics.totalVectors || 0,
        codeVectors: cachedVectorFile?.statistics.codeVectors || 0,
        qaVectors: cachedVectorFile?.statistics.qaVectors || 0
    };
}
