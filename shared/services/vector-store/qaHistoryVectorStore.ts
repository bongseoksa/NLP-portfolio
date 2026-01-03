/**
 * Q&A 히스토리 벡터 스토어 (Serverless 환경용)
 *
 * 질의응답 히스토리를 임베딩하여 파일로 저장하고 관리
 * - Atomic Write로 동시성 문제 회피
 * - Pruning으로 무한 증가 방지
 * - 검색 대상에 자동 포함
 */

import { promisify } from "util";
import { gzip, gunzip } from "zlib";
import { generateQueryEmbedding } from "./embeddingService.js";
import { env } from "../../config/env.js";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Q&A 히스토리 벡터 타입
export interface QAHistoryVector {
    id: string;
    type: "question" | "answer" | "conversation";
    embedding: number[];
    content: string;
    metadata: {
        sessionId: string;
        questionId?: string;
        answerId?: string;
        category: string;
        categoryConfidence: number;
        timestamp: string;
        responseTimeMs: number;
        tokenUsage: number;
        sources?: string[];
        status: "success" | "partial" | "failed";
        owner: string;
        repo: string;
    };
    createdAt: string;
}

// 히스토리 파일 스키마
export interface QAHistoryVectorFile {
    version: string;
    createdAt: string;
    lastUpdated: string;
    fileVersion: number;
    repository: {
        owner: string;
        name: string;
    };
    embedding: {
        model: string;
        provider: string;
        dimension: number;
    };
    statistics: {
        totalVectors: number;
        questionVectors: number;
        answerVectors: number;
        maxHistorySize: number;
        prunedCount: number;
    };
    index: {
        bySession: {
            [sessionId: string]: number[];
        };
        byCategory: {
            [category: string]: number[];
        };
        byTimestamp: number[];
    };
    vectors: QAHistoryVector[];
}

// Pruning 옵션
export interface PruningOptions {
    maxCount?: number;
    maxAgeDays?: number;
    minImportanceScore?: number;
    strategy: "count" | "time" | "importance" | "hybrid";
}

// 메모리 캐시
let cachedHistoryFile: QAHistoryVectorFile | null = null;
let cacheTimestamp: number = 0;
let cachedETag: string | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

/**
 * 히스토리 파일 로딩
 */
async function loadHistoryFile(): Promise<QAHistoryVectorFile> {
    const now = Date.now();

    // 캐시 유효성 검사
    if (cachedHistoryFile && (now - cacheTimestamp) < CACHE_TTL_MS) {
        console.log("✅ Using cached history file");
        return cachedHistoryFile;
    }

    const vectorFileUrl = env.VECTOR_FILE_URL();
    const historyFileUrl = vectorFileUrl.replace('embeddings.json.gz', 'qa-history-embeddings-latest.json.gz');

    if (!historyFileUrl) {
        // 파일이 없으면 빈 파일 생성
        return createEmptyHistoryFile();
    }

    console.log("📥 Loading history file from CDN...");
    const startTime = Date.now();

    try {
        const headers: HeadersInit = {
            'Accept-Encoding': 'gzip'
        };

        if (cachedETag) {
            headers['If-None-Match'] = cachedETag;
        }

        const response = await fetch(historyFileUrl, { headers });

        // 304 Not Modified
        if (response.status === 304 && cachedHistoryFile) {
            console.log("✅ Using cached file (304 Not Modified)");
            cacheTimestamp = Date.now();
            return cachedHistoryFile;
        }

        if (!response.ok) {
            if (response.status === 404) {
                console.log("⚠️  History file not found, creating empty file");
                return createEmptyHistoryFile();
            }
            throw new Error(`Failed to fetch history file: ${response.statusText}`);
        }

        const etag = response.headers.get('ETag');
        if (etag) {
            cachedETag = etag;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        let jsonString: string;

        if (historyFileUrl.endsWith('.gz')) {
            const decompressed = await gunzipAsync(buffer);
            jsonString = decompressed.toString('utf-8');
        } else {
            jsonString = buffer.toString('utf-8');
        }

        const parsed = JSON.parse(jsonString) as QAHistoryVectorFile;

        cachedHistoryFile = parsed;
        cacheTimestamp = now;

        const loadTime = Date.now() - startTime;
        console.log(`✅ Loaded ${parsed.statistics.totalVectors} history vectors in ${loadTime}ms`);

        return parsed;

    } catch (error: any) {
        console.error("❌ Failed to load history file:", error.message);
        return createEmptyHistoryFile();
    }
}

/**
 * 빈 히스토리 파일 생성
 */
function createEmptyHistoryFile(): QAHistoryVectorFile {
    const owner = env.TARGET_REPO_OWNER();
    const repo = env.TARGET_REPO_NAME();
    const now = new Date().toISOString();

    return {
        version: "1.0",
        createdAt: now,
        lastUpdated: now,
        fileVersion: 0,
        repository: {
            owner,
            name: repo
        },
        embedding: {
            model: "sentence-transformers/all-MiniLM-L6-v2",
            provider: "huggingface",
            dimension: 384
        },
        statistics: {
            totalVectors: 0,
            questionVectors: 0,
            answerVectors: 0,
            maxHistorySize: 1000,
            prunedCount: 0
        },
        index: {
            bySession: {},
            byCategory: {},
            byTimestamp: []
        },
        vectors: []
    };
}

/**
 * 인덱스 빌드
 */
function buildIndex(vectors: QAHistoryVector[]): QAHistoryVectorFile['index'] {
    const bySession: { [sessionId: string]: number[] } = {};
    const byCategory: { [category: string]: number[] } = {};
    const byTimestamp: number[] = [];

    vectors.forEach((vec, idx) => {
        // 세션별 인덱스
        const sessionId = vec.metadata.sessionId;
        if (!bySession[sessionId]) {
            bySession[sessionId] = [];
        }
        bySession[sessionId].push(idx);

        // 카테고리별 인덱스
        const category = vec.metadata.category;
        if (!byCategory[category]) {
            byCategory[category] = [];
        }
        byCategory[category].push(idx);

        // 시간순 인덱스
        byTimestamp.push(idx);
    });

    // 시간순 정렬 (오래된 순)
    byTimestamp.sort((a, b) => {
        const timeA = new Date(vectors[a].metadata.timestamp).getTime();
        const timeB = new Date(vectors[b].metadata.timestamp).getTime();
        return timeA - timeB;
    });

    return { bySession, byCategory, byTimestamp };
}

/**
 * 개수 기반 Pruning
 */
function pruneByCount(
    vectors: QAHistoryVector[],
    maxCount: number = 1000
): QAHistoryVector[] {
    const sorted = [...vectors].sort((a, b) => 
        new Date(b.metadata.timestamp).getTime() - 
        new Date(a.metadata.timestamp).getTime()
    );
    return sorted.slice(0, maxCount);
}

/**
 * 시간 기반 Pruning
 */
function pruneByTime(
    vectors: QAHistoryVector[],
    maxAgeDays: number = 30
): QAHistoryVector[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    return vectors.filter(vec => {
        const vecDate = new Date(vec.metadata.timestamp);
        return vecDate >= cutoffDate;
    });
}

/**
 * 중요도 기반 Pruning
 */
function calculateImportanceScore(
    vector: QAHistoryVector,
    searchCount: number = 0
): number {
    const ageDays = (Date.now() - new Date(vector.metadata.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    
    let score = 1.0;

    // 성공률 가중치
    if (vector.metadata.status === "success") {
        score += 2.0;
    } else if (vector.metadata.status === "partial") {
        score += 1.0;
    }

    // 검색 빈도 가중치
    score += Math.log10(searchCount + 1) * 0.5;

    // 시간 가중치 (최근일수록 높음)
    score += Math.exp(-ageDays / 7) * 1.0;

    // 카테고리 가중치
    const importantCategories = ["implementation", "structure", "architecture"];
    if (importantCategories.includes(vector.metadata.category)) {
        score += 0.5;
    }

    return score;
}

function pruneByImportance(
    vectors: QAHistoryVector[],
    maxCount: number = 1000,
    searchCounts: Map<string, number> = new Map()
): QAHistoryVector[] {
    const scored = vectors.map(vec => ({
        vector: vec,
        score: calculateImportanceScore(vec, searchCounts.get(vec.id) || 0)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxCount).map(item => item.vector);
}

/**
 * 통합 Pruning
 */
async function pruneHistory(
    vectors: QAHistoryVector[],
    options: PruningOptions
): Promise<QAHistoryVector[]> {
    const {
        maxCount = 1000,
        maxAgeDays = 30,
        strategy = "hybrid"
    } = options;

    let pruned = [...vectors];

    switch (strategy) {
        case "count":
            pruned = pruneByCount(pruned, maxCount);
            break;

        case "time":
            pruned = pruneByTime(pruned, maxAgeDays);
            break;

        case "importance":
            const searchCounts = new Map<string, number>(); // TODO: 실제 검색 빈도 데이터 로드
            pruned = pruneByImportance(pruned, maxCount, searchCounts);
            break;

        case "hybrid":
        default:
            pruned = pruneByTime(pruned, maxAgeDays);
            if (pruned.length > maxCount) {
                const searchCounts = new Map<string, number>();
                pruned = pruneByImportance(pruned, maxCount, searchCounts);
            }
            break;
    }

    return pruned;
}

/**
 * Atomic Write: 임시 파일 → 원자적 이동
 * 
 * Serverless 환경에서는 실제 파일 시스템이 없으므로,
 * 이벤트 큐에 추가하는 방식으로 구현
 */
export async function addQAHistoryToVectors(
    qaRecord: {
        sessionId: string;
        question: string;
        answer: string;
        category: string;
        categoryConfidence: number;
        sources: string[];
        status: "success" | "partial" | "failed";
        responseTimeMs: number;
        tokenUsage: number;
        owner: string;
        repo: string;
    }
): Promise<void> {
    try {
        // 1. 질문/답변 임베딩 생성
        console.log("🔄 Generating history embeddings...");
        const [questionEmbedding, answerEmbedding] = await Promise.all([
            generateQueryEmbedding(qaRecord.question),
            generateQueryEmbedding(qaRecord.answer)
        ]);

        const timestamp = new Date().toISOString();
        const questionId = `qa-${qaRecord.sessionId}-${Date.now()}-question`;
        const answerId = `qa-${qaRecord.sessionId}-${Date.now()}-answer`;

        // 2. 벡터 생성
        const questionVector: QAHistoryVector = {
            id: questionId,
            type: "question",
            embedding: questionEmbedding,
            content: qaRecord.question,
            metadata: {
                sessionId: qaRecord.sessionId,
                answerId: answerId,
                category: qaRecord.category,
                categoryConfidence: qaRecord.categoryConfidence,
                timestamp,
                responseTimeMs: qaRecord.responseTimeMs,
                tokenUsage: qaRecord.tokenUsage,
                sources: qaRecord.sources,
                status: qaRecord.status,
                owner: qaRecord.owner,
                repo: qaRecord.repo
            },
            createdAt: timestamp
        };

        const answerVector: QAHistoryVector = {
            id: answerId,
            type: "answer",
            embedding: answerEmbedding,
            content: qaRecord.answer,
            metadata: {
                sessionId: qaRecord.sessionId,
                questionId: questionId,
                category: qaRecord.category,
                categoryConfidence: qaRecord.categoryConfidence,
                timestamp,
                responseTimeMs: qaRecord.responseTimeMs,
                tokenUsage: qaRecord.tokenUsage,
                sources: qaRecord.sources,
                status: qaRecord.status,
                owner: qaRecord.owner,
                repo: qaRecord.repo
            },
            createdAt: timestamp
        };

        // 3. Serverless 환경에서는 이벤트 큐에 추가
        // 실제 파일 업데이트는 별도 배치 작업에서 처리
        console.log("✅ History vectors generated (will be saved in batch)");
        
        // TODO: 이벤트 큐에 추가 (Vercel Queue, SQS 등)
        // 현재는 메모리 캐시에만 추가 (임시)
        await addToMemoryCache([questionVector, answerVector]);

    } catch (error: any) {
        console.error("❌ Failed to add history to vectors:", error.message);
        // 실패해도 API 응답은 정상적으로 반환
    }
}

/**
 * 메모리 캐시에 추가 (임시 구현)
 * 실제로는 이벤트 큐를 통해 배치 처리되어야 함
 */
async function addToMemoryCache(newVectors: QAHistoryVector[]): Promise<void> {
    const existingFile = await loadHistoryFile();
    
    const updatedVectors = [...existingFile.vectors, ...newVectors];
    const prunedVectors = await pruneHistory(updatedVectors, {
        maxCount: existingFile.statistics.maxHistorySize,
        strategy: "hybrid"
    });

    const updatedFile: QAHistoryVectorFile = {
        ...existingFile,
        lastUpdated: new Date().toISOString(),
        fileVersion: existingFile.fileVersion + 1,
        statistics: {
            ...existingFile.statistics,
            totalVectors: prunedVectors.length,
            questionVectors: prunedVectors.filter(v => v.type === "question").length,
            answerVectors: prunedVectors.filter(v => v.type === "answer").length,
            prunedCount: existingFile.statistics.totalVectors + newVectors.length - prunedVectors.length
        },
        index: buildIndex(prunedVectors),
        vectors: prunedVectors
    };

    cachedHistoryFile = updatedFile;
    cacheTimestamp = Date.now();
}

/**
 * 히스토리 벡터 검색
 */
export async function searchHistoryVectors(
    queryEmbedding: number[],
    topK: number = 5,
    options?: {
        threshold?: number;
        category?: string;
        sessionId?: string;
    }
): Promise<Array<{
    id: string;
    content: string;
    metadata: QAHistoryVector['metadata'];
    score: number;
}>> {
    const { threshold = 0.0, category, sessionId } = options || {};

    const historyFile = await loadHistoryFile();
    
    // 필터링
    let candidates = historyFile.vectors;

    if (sessionId) {
        const indices = historyFile.index.bySession[sessionId] || [];
        candidates = indices.map(i => historyFile.vectors[i]).filter(v => v !== undefined);
    }

    if (category) {
        const indices = historyFile.index.byCategory[category] || [];
        const categoryVectors = indices.map(i => historyFile.vectors[i]).filter(v => v !== undefined);
        if (categoryVectors.length > 0) {
            candidates = candidates.filter(v => categoryVectors.includes(v));
        }
    }

    // 코사인 유사도 계산
    const similarities = candidates.map(vec => {
        const score = cosineSimilarity(queryEmbedding, vec.embedding);
        return { id: vec.id, content: vec.content, metadata: vec.metadata, score };
    });

    // Top-K 추출
    return similarities
        .filter(s => s.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}

/**
 * 코사인 유사도 계산
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
        throw new Error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
    }

    if (vecA.length === 0) {
        return 0;
    }

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

    if (!isFinite(denominator) || denominator === 0) {
        return 0;
    }

    const similarity = dotProduct / denominator;
    return Math.max(-1, Math.min(1, similarity));
}

/**
 * 캐시 초기화
 */
export function clearHistoryCache(): void {
    cachedHistoryFile = null;
    cacheTimestamp = 0;
    cachedETag = null;
    console.log("🗑️  History cache cleared");
}

