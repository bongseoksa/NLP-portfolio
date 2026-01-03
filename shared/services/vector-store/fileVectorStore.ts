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
import { env } from "../../config/env.js";

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
let cachedETag: string | null = null;
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
 *
 * 로딩 우선순위:
 * 1. VECTOR_FILE_URL 환경 변수 (HTTP/HTTPS URL)
 * 2. 로컬 파일 (output/embeddings.json.gz)
 */
async function loadVectorFile(): Promise<VectorFile> {
    const now = Date.now();

    // 캐시 유효성 검사
    if (cachedVectorFile && (now - cacheTimestamp) < CACHE_TTL_MS) {
        console.log("✅ Using cached vector file");
        return cachedVectorFile;
    }

    const startTime = Date.now();

    // 환경 변수로 URL 지정 (기본값: output/embeddings.json.gz)
    const vectorFileUrl = env.VECTOR_FILE_URL();

    let buffer: Buffer;

    // 1. URL이 지정된 경우: HTTP/HTTPS로 다운로드
    if (vectorFileUrl && (vectorFileUrl.startsWith('http://') || vectorFileUrl.startsWith('https://'))) {
        console.log(`📥 Loading vector file from URL: ${vectorFileUrl}`);

        try {
            // HTTP 캐싱 헤더 활용 (조건부 요청)
            const headers: HeadersInit = {
                'Accept-Encoding': 'gzip'
            };

            if (cachedETag) {
                headers['If-None-Match'] = cachedETag;
            }

            const response = await fetch(vectorFileUrl, { headers });

            // 304 Not Modified: 캐시된 파일 사용
            if (response.status === 304 && cachedVectorFile) {
                console.log("✅ Using cached file (304 Not Modified)");
                cacheTimestamp = Date.now();
                return cachedVectorFile;
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch vector file: ${response.statusText}`);
            }

            // ETag 저장 (다음 요청 시 사용)
            const etag = response.headers.get('ETag');
            if (etag) {
                cachedETag = etag;
            }

            buffer = Buffer.from(await response.arrayBuffer());
        } catch (error: any) {
            throw new Error(`Failed to load vector file from URL: ${error.message}`);
        }
    }
    // 2. URL이 없거나 로컬 경로인 경우: 로컬 파일 시스템에서 읽기
    else {
        const fs = await import('fs/promises');
        const path = await import('path');

        const localPath = vectorFileUrl || 'output/embeddings.json.gz';
        const resolvedPath = path.resolve(process.cwd(), localPath);

        console.log(`📂 Loading vector file from local: ${resolvedPath}`);

        try {
            buffer = await fs.readFile(resolvedPath);
        } catch (error: any) {
            throw new Error(`Failed to load vector file from ${resolvedPath}: ${error.message}`);
        }
    }

    try {
        // gzip 압축 해제 (파일이 .gz로 끝나는 경우)
        let jsonString: string;
        const isGzipped = (vectorFileUrl && vectorFileUrl.endsWith('.gz')) ||
                         (!vectorFileUrl && 'output/embeddings.json.gz'.endsWith('.gz'));

        if (isGzipped) {
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
 * 
 * 공식: cos(θ) = (A · B) / (||A|| × ||B||)
 * 
 * @param vecA 첫 번째 벡터 (쿼리 임베딩)
 * @param vecB 두 번째 벡터 (저장된 임베딩)
 * @returns 유사도 점수 (0 ~ 1, 1에 가까울수록 유사)
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    // 벡터 차원 검증
    if (vecA.length !== vecB.length) {
        throw new Error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
    }

    if (vecA.length === 0) {
        return 0;
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

    // 0으로 나누기 방지 및 안전성 체크
    if (!isFinite(denominator) || denominator === 0) {
        return 0;
    }

    // 코사인 유사도 반환 (결과 범위 검증)
    const similarity = dotProduct / denominator;
    return Math.max(-1, Math.min(1, similarity));
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
 * 검색 처리 흐름:
 * 1. 벡터 파일 로딩 (캐시 우선)
 * 2. 검색 모드 결정 (code/qa/mixed/all)
 * 3. 후보 벡터 선택 (인덱스 활용)
 * 4. 메타데이터 필터링
 * 5. 코사인 유사도 계산
 * 6. Top-K 추출 및 정렬
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
        includeHistory?: boolean;
        historyWeight?: number;
    }
): Promise<SearchResult[]> {
    const {
        threshold = 0.0,
        mode: explicitMode,
        category,
        filterMetadata,
        includeHistory = true,
        historyWeight = 0.3
    } = options || {};

    // 검색 모드 결정 (명시적 > 카테고리 기반 > 기본값)
    const mode = explicitMode || determineSearchMode(category) || "all";

    console.log(`🔍 Searching vectors (mode: ${mode}, history: ${includeHistory})...`);
    const searchStart = Date.now();
    const loadStart = Date.now();

    // 1. 벡터 파일 로딩 (캐시 우선)
    const vectorFile = await loadVectorFile();
    const loadTime = Date.now() - loadStart;

    // 2. 검색 모드에 따라 후보 벡터 선택
    let candidates: Vector[];
    let candidatesCount = 0;

    switch (mode) {
        case "code":
            // 코드만 검색 (index 활용 - O(k) vs O(n))
            candidates = vectorFile.index.byType.code
                .map(i => vectorFile.vectors[i])
                .filter((v): v is Vector => v !== undefined);
            candidatesCount = candidates.length;
            console.log(`   → Using ${candidatesCount} code vectors (indexed)`);
            break;

        case "qa":
            // Q&A만 검색 (index 활용)
            candidates = vectorFile.index.byType.qa
                .map(i => vectorFile.vectors[i])
                .filter((v): v is Vector => v !== undefined);
            candidatesCount = candidates.length;
            console.log(`   → Using ${candidatesCount} Q&A vectors (indexed)`);
            break;

        case "mixed":
            // 코드 50% + Q&A 50% 동시 검색
            const codeVectors = vectorFile.index.byType.code
                .map(i => vectorFile.vectors[i])
                .filter((v): v is Vector => v !== undefined);
            const qaVectors = vectorFile.index.byType.qa
                .map(i => vectorFile.vectors[i])
                .filter((v): v is Vector => v !== undefined);

            const codeK = Math.ceil(topK / 2);
            const qaK = Math.floor(topK / 2);

            console.log(`   → Searching ${codeVectors.length} code + ${qaVectors.length} Q&A vectors`);

            const codeResults = searchInVectors(codeVectors, queryEmbedding, codeK, threshold, filterMetadata);
            const qaResults = searchInVectors(qaVectors, queryEmbedding, qaK, threshold, filterMetadata);

            // 결과 병합 및 재정렬
            const mixedResults = [...codeResults, ...qaResults]
                .sort((a, b) => b.score - a.score)
                .slice(0, topK);

            const mixedTime = Date.now() - searchStart;
            console.log(`   → Found ${mixedResults.length} results (${codeResults.length} code + ${qaResults.length} qa) in ${mixedTime}ms`);
            console.log(`   → Load: ${loadTime}ms, Search: ${mixedTime - loadTime}ms`);

            return mixedResults;

        case "all":
        default:
            // 전체 검색 (스코어 기준 Top-K)
            candidates = vectorFile.vectors;
            candidatesCount = candidates.length;
            console.log(`   → Using all ${candidatesCount} vectors`);
            break;
    }

    // 3. 유사도 계산 및 필터링
    let results = searchInVectors(candidates, queryEmbedding, topK, threshold, filterMetadata);

    // 4. 히스토리 벡터 검색 (선택적)
    if (includeHistory && mode !== "code") {
        try {
            const { searchHistoryVectors } = await import("./qaHistoryVectorStore.js");
            const historyTopK = Math.ceil(topK * historyWeight);
            const codeTopK = Math.floor(topK * (1 - historyWeight));

            // 코드 결과 조정
            results = results.slice(0, codeTopK);

            // 히스토리 검색
            const historyOptions: {
                threshold?: number;
                category?: string;
                sessionId?: string;
            } = { threshold };
            if (category) {
                historyOptions.category = category;
            }
            if (filterMetadata?.sessionId) {
                historyOptions.sessionId = filterMetadata.sessionId as string;
            }
            const historyResults = await searchHistoryVectors(queryEmbedding, historyTopK, historyOptions);

            // 결과 병합 및 재정렬
            const allResults = [
                ...results,
                ...historyResults.map(h => ({
                    id: h.id,
                    content: h.content,
                    metadata: h.metadata,
                    score: h.score
                }))
            ]
                .sort((a, b) => b.score - a.score)
                .slice(0, topK);

            results = allResults;
            console.log(`   → Found ${results.length} results (${codeTopK} code + ${historyResults.length} history)`);
        } catch (error: any) {
            console.warn("⚠️  History search failed:", error.message);
            // 히스토리 검색 실패해도 코드 결과는 반환
        }
    }

    const searchTime = Date.now() - searchStart;
    const actualSearchTime = searchTime - loadTime;
    console.log(`   → Found ${results.length} results in ${searchTime}ms`);
    console.log(`   → Load: ${loadTime}ms, Search: ${actualSearchTime}ms, Candidates: ${candidatesCount}`);

    return results;
}

/**
 * 벡터 배열에서 검색 수행 (내부 헬퍼)
 * 
 * 최적화:
 * - 메타데이터 필터링으로 후보 벡터 수 축소
 * - 임계값 필터링으로 불필요한 계산 제거
 * - 부분 정렬로 Top-K 추출 최적화 (대용량 벡터 세트)
 */
function searchInVectors(
    vectors: Vector[],
    queryEmbedding: number[],
    topK: number,
    threshold: number = 0.0,
    filterMetadata?: Record<string, any>
): SearchResult[] {
    // 대용량 벡터 세트에서는 부분 정렬 최적화
    const usePartialSort = vectors.length > 10000 && topK < vectors.length / 10;
    
    if (usePartialSort) {
        return searchWithPartialSort(vectors, queryEmbedding, topK, threshold, filterMetadata);
    }

    // 작은 벡터 세트는 전체 정렬이 더 빠름
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

        // 임계값 이상인 경우만 추가
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
 * 부분 정렬을 사용한 검색 (대용량 벡터 세트 최적화)
 * 
 * Top-K만 유지하면서 O(n log k) 시간 복잡도 달성
 * 전체 정렬 O(n log n)보다 빠름
 */
function searchWithPartialSort(
    vectors: Vector[],
    queryEmbedding: number[],
    topK: number,
    threshold: number = 0.0,
    filterMetadata?: Record<string, any>
): SearchResult[] {
    // Top-K 유지용 배열 (최소 힙처럼 동작)
    const topKResults: Array<{ id: string; score: number; data: Vector }> = [];

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

        // 임계값 체크
        if (score < threshold) continue;

        // Top-K 유지 로직
        if (topKResults.length < topK) {
            // 아직 K개 미만이면 추가
            topKResults.push({ id: vec.id, score, data: vec });
            
            // 마지막에 추가된 경우만 정렬 (부분 정렬)
            if (topKResults.length === topK) {
                topKResults.sort((a, b) => a.score - b.score); // 최소 힙처럼 (오름차순)
            }
        } else {
            // topKResults.length >= topK이므로 첫 번째 요소는 항상 존재
            const firstResult = topKResults[0];
            if (firstResult && score > firstResult.score) {
                // 현재 최소값보다 크면 교체
                topKResults[0] = { id: vec.id, score, data: vec };
                
                // 첫 번째 요소만 재정렬 (부분 정렬 최적화)
                // 전체 정렬 대신 삽입 정렬 방식으로 최소값 찾기
                let minIdx = 0;
                for (let i = 1; i < topKResults.length; i++) {
                    const current = topKResults[i];
                    const min = topKResults[minIdx];
                    if (current && min && current.score < min.score) {
                        minIdx = i;
                    }
                }
                if (minIdx !== 0) {
                    const temp = topKResults[0];
                    const minResult = topKResults[minIdx];
                    if (temp && minResult) {
                        topKResults[0] = minResult;
                        topKResults[minIdx] = temp;
                    }
                }
            }
        }
    }

    // 내림차순으로 정렬하여 반환
    topKResults.sort((a, b) => b.score - a.score);

    return topKResults.map(result => ({
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
    cachedETag = null;
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
    etag: string | null;
} {
    const age = cachedVectorFile ? Date.now() - cacheTimestamp : 0;
    return {
        cached: cachedVectorFile !== null,
        age,
        totalVectors: cachedVectorFile?.statistics.totalVectors || 0,
        codeVectors: cachedVectorFile?.statistics.codeVectors || 0,
        qaVectors: cachedVectorFile?.statistics.qaVectors || 0,
        etag: cachedETag
    };
}

/**
 * 검색 성능 메트릭 인터페이스
 */
export interface SearchMetrics {
    fileLoadTime: number;      // 파일 로딩 시간 (ms)
    searchTime: number;        // 검색 시간 (ms)
    candidatesCount: number;    // 후보 벡터 수
    resultsCount: number;       // 결과 수
    cacheHit: boolean;          // 캐시 히트 여부
    mode: SearchMode;           // 검색 모드
}

/**
 * 검색 성능 메트릭 수집 (디버깅/모니터링용)
 */
export function collectSearchMetrics(
    loadTime: number,
    searchTime: number,
    candidatesCount: number,
    resultsCount: number,
    cacheHit: boolean,
    mode: SearchMode
): SearchMetrics {
    return {
        fileLoadTime: loadTime,
        searchTime,
        candidatesCount,
        resultsCount,
        cacheHit,
        mode
    };
}

/**
 * 배치 코사인 유사도 계산 (여러 벡터 동시 처리)
 * 
 * 최적화: 쿼리 벡터의 norm을 한 번만 계산하여 재사용
 * 
 * @param queryEmbedding 쿼리 임베딩 벡터
 * @param candidateVectors 후보 벡터 배열
 * @returns 유사도 점수 배열
 */
export function batchCosineSimilarity(
    queryEmbedding: number[],
    candidateVectors: number[][]
): number[] {
    // 쿼리 벡터의 norm 사전 계산 (한 번만 계산)
    const queryNorm = Math.sqrt(
        queryEmbedding.reduce((sum, val) => sum + val * val, 0)
    );

    return candidateVectors.map(candidate => {
        let dotProduct = 0;
        let candidateNorm = 0;

        for (let i = 0; i < queryEmbedding.length; i++) {
            const q = queryEmbedding[i];
            const c = candidate[i];
            if (q !== undefined && c !== undefined) {
                dotProduct += q * c;
                candidateNorm += c * c;
            }
        }

        const denominator = queryNorm * Math.sqrt(candidateNorm);
        return denominator === 0 ? 0 : dotProduct / denominator;
    });
}
