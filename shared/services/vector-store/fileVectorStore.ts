/**
 * File-based Vector Store
 * 파일 기반 벡터 검색 (in-memory cosine similarity)
 *
 * 벡터 파일: output/embeddings.json.gz
 * 캐싱: 5분 TTL
 */

import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import type { EmbeddingItem, VectorFile } from '../../models/EmbeddingItem.js';
import type { SearchResult } from '../../models/SearchResult.js';

// Cache for vector file
let cachedVectors: VectorFile | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5분

/**
 * 벡터 파일 로드 (캐싱 적용)
 */
async function loadVectorFile(): Promise<VectorFile> {
  const now = Date.now();

  // Return cached data if still valid
  if (cachedVectors && now < cacheExpiry) {
    return cachedVectors;
  }

  const filePath = path.join(process.cwd(), 'output', 'embeddings.json.gz');

  if (!fs.existsSync(filePath)) {
    throw new Error(
      'Vector file not found: output/embeddings.json.gz. Run "pnpm run local_export" first.'
    );
  }

  try {
    const compressed = fs.readFileSync(filePath);
    const decompressed = zlib.gunzipSync(compressed);
    cachedVectors = JSON.parse(decompressed.toString()) as VectorFile;
    cacheExpiry = now + CACHE_TTL;

    console.log(`[VectorStore] Loaded ${cachedVectors.vectors.length} vectors from file`);

    return cachedVectors;
  } catch (error) {
    throw new Error(
      `Failed to load vector file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Cosine Similarity 계산
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    console.warn(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * 유사한 벡터 검색
 * @param queryEmbedding - 쿼리 임베딩 (768차원)
 * @param topK - 반환할 결과 수
 * @returns 유사도 순으로 정렬된 검색 결과
 */
export async function searchSimilar(
  queryEmbedding: number[],
  topK: number = 5
): Promise<SearchResult[]> {
  const vectorFile = await loadVectorFile();

  // Calculate similarity for all vectors
  const scored: SearchResult[] = vectorFile.vectors.map((item: EmbeddingItem) => ({
    id: item.id,
    type: item.type,
    content: item.content,
    metadata: item.metadata,
    score: cosineSimilarity(queryEmbedding, item.embedding),
  }));

  // Sort by score (descending) and take top K
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

/**
 * 벡터 저장소 통계 조회
 */
export async function getVectorStats(): Promise<VectorFile['statistics']> {
  const vectorFile = await loadVectorFile();
  return vectorFile.statistics;
}

/**
 * 캐시 무효화 (테스트/개발용)
 */
export function invalidateCache(): void {
  cachedVectors = null;
  cacheExpiry = 0;
}
