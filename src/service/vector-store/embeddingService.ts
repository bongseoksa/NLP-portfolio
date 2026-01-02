/**
 * 임베딩 생성 서비스 (외부 API 래퍼)
 *
 * 주의: 이 서비스는 **쿼리 임베딩만** 생성합니다.
 * 문서 임베딩은 embedding-pipeline에서만 생성됩니다.
 */
import { generateEmbeddings } from "../../embedding-pipeline/nlp/embedding/openaiEmbedding.js";

/**
 * 사용자 질문을 임베딩 벡터로 변환
 *
 * @param query 사용자 질문 (단일 문자열)
 * @returns 1536차원 임베딩 벡터
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
    const embeddings = await generateEmbeddings([query]);

    if (!embeddings || embeddings.length === 0 || !embeddings[0]) {
        throw new Error("Failed to generate query embedding");
    }

    return embeddings[0];
}
