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
 * 쿼리 텍스트에 대한 임베딩 생성
 * @param query - 사용자 질문
 * @returns 768차원 벡터
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const model = getGenAI().getGenerativeModel({ model: 'text-embedding-004' });

  try {
    const result = await model.embedContent(query);
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
