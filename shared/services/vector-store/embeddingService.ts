/**
 * Embedding Service
 * 쿼리 임베딩 생성 (Gemini API - 768차원)
 *
 * 주의: Supabase에 저장된 임베딩과 동일한 모델(text-embedding-004)을 사용해야 합니다.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (genAI) return genAI;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable');
  }

  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

/**
 * 한국어-영어 키워드 매핑 사전
 * 코드 검색에 자주 사용되는 기술 용어
 */
const KEYWORD_MAPPINGS: Record<string, string[]> = {
  // 에러/예외 처리
  에러: ['error', 'Error', 'handleError', 'errorHandler', 'exception'],
  오류: ['error', 'Error', 'handleError', 'errorHandler', 'exception'],
  예외: ['exception', 'error', 'try', 'catch', 'throw'],
  핸들링: ['handling', 'handler', 'handle', 'Handler'],
  처리: ['handling', 'handler', 'handle', 'process', 'Handler'],

  // 벡터/검색
  벡터: ['vector', 'Vector', 'embedding', 'Embedding'],
  검색: ['search', 'Search', 'query', 'find', 'similarity'],
  유사도: ['similarity', 'cosine', 'cosineSimilarity', 'score'],
  임베딩: ['embedding', 'Embedding', 'embed', 'vector'],

  // LLM/AI
  llm: ['LLM', 'llm', 'language model', 'generateAnswer'],
  폴백: ['fallback', 'Fallback', 'retry', 'alternative'],
  fallback: ['fallback', 'Fallback', 'retry', 'alternative'],
  답변: ['answer', 'Answer', 'response', 'generate', 'generateAnswer'],
  생성: ['generate', 'Generate', 'create', 'generation'],

  // API/서버
  api: ['API', 'api', 'endpoint', 'handler', 'route'],
  서버: ['server', 'Server', 'backend', 'api'],
  엔드포인트: ['endpoint', 'Endpoint', 'route', 'handler'],
  라우트: ['route', 'Route', 'router', 'routing'],

  // 데이터베이스
  데이터베이스: ['database', 'Database', 'db', 'supabase', 'storage'],
  저장: ['save', 'store', 'Storage', 'persist', 'write'],
  조회: ['query', 'fetch', 'get', 'find', 'read'],

  // 파일/구조
  파일: ['file', 'File', 'fileVectorStore', 'path'],
  구조: ['structure', 'Structure', 'architecture', 'design'],
  구현: ['implementation', 'implement', 'Implementation', 'code'],
  동작: ['work', 'operation', 'behavior', 'function', 'how'],
  사용: ['use', 'usage', 'using', 'utilize'],
  알고리즘: ['algorithm', 'Algorithm', 'method', 'approach'],

  // 인증/보안
  인증: ['auth', 'authentication', 'Authorization', 'token'],
  보안: ['security', 'Security', 'secure', 'protection'],

  // 캐시/성능
  캐시: ['cache', 'Cache', 'caching', 'cached'],
  성능: ['performance', 'Performance', 'optimization', 'speed'],

  // 테스트
  테스트: ['test', 'Test', 'testing', 'spec'],

  // 설정
  설정: ['config', 'configuration', 'Configuration', 'settings'],
  환경: ['environment', 'env', 'Environment'],
};

/**
 * 규칙 기반 쿼리 확장
 * 한국어 키워드를 영어 검색 키워드로 변환
 */
function expandQueryWithKeywords(query: string): string {
  const hasKorean = /[가-힣]/.test(query);
  if (!hasKorean) {
    return query;
  }

  const expandedKeywords: string[] = [];

  // 매핑 사전에서 키워드 추출
  for (const [korean, englishTerms] of Object.entries(KEYWORD_MAPPINGS)) {
    if (query.toLowerCase().includes(korean.toLowerCase())) {
      expandedKeywords.push(...englishTerms);
    }
  }

  // 중복 제거
  const uniqueKeywords = [...new Set(expandedKeywords)];

  if (uniqueKeywords.length > 0) {
    const expanded = `${query} ${uniqueKeywords.join(' ')}`;
    console.log(`[QueryExpansion] "${query}" → added keywords: [${uniqueKeywords.join(', ')}]`);
    return expanded;
  }

  return query;
}

/**
 * 쿼리 텍스트에 대한 임베딩 생성
 * 한국어 질문은 자동으로 영어 키워드로 확장됩니다.
 * @param query - 사용자 질문
 * @returns 768차원 벡터
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const model = getGenAI().getGenerativeModel({ model: 'text-embedding-004' });

  try {
    // 한국어 질문을 영어 키워드로 확장
    const expandedQuery = expandQueryWithKeywords(query);

    const result = await model.embedContent(expandedQuery);
    return result.embedding.values;
  } catch (error) {
    console.error('Failed to generate query embedding:', error);
    throw new Error(
      `Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * 임베딩 모델 정보
 */
export const EMBEDDING_MODEL_INFO = {
  name: 'text-embedding-004',
  provider: 'Google Gemini',
  dimensions: 768,
};
