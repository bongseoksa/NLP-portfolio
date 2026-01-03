/**
 * 임베딩 생성 서비스 (외부 API 래퍼)
 *
 * 주의: 이 서비스는 **쿼리 임베딩만** 생성합니다.
 * 문서 임베딩은 embedding-pipeline에서만 생성됩니다.
 */
// 기획서에 명시된 기술 스택: Hugging Face sentence-transformers/all-MiniLM-L6-v2
import { pipeline } from '@xenova/transformers';

// 모델 캐싱
let embeddingModel: any = null;

/**
 * Hugging Face Transformers를 사용하여 임베딩 생성
 * 
 * @param texts 텍스트 배열
 * @returns 임베딩 벡터 배열 (384 차원 - all-MiniLM-L6-v2)
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!embeddingModel) {
        console.log("📥 Loading Hugging Face model: all-MiniLM-L6-v2...");
        embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }

    const result = await embeddingModel(texts, { pooling: 'mean', normalize: true });
    
    // @xenova/transformers는 텍스트 배열을 받으면 배열을 반환
    if (Array.isArray(result)) {
        return result.map((emb: any) => {
            // Tensor 객체인 경우 data 속성에서 배열 추출
            if (emb?.data) {
                return Array.from(emb.data);
            }
            // 이미 배열인 경우
            return Array.isArray(emb) ? emb : Array.from(emb);
        });
    }
    
    // 단일 텍스트인 경우 (배열이 아닌 단일 결과)
    if (result?.data) {
        return [Array.from(result.data)];
    }
    
    // 이미 배열인 경우
    return [Array.isArray(result) ? result : Array.from(result)];
}

/**
 * 사용자 질문을 임베딩 벡터로 변환
 *
 * @param query 사용자 질문 (단일 문자열)
 * @returns 384차원 임베딩 벡터 (Hugging Face sentence-transformers/all-MiniLM-L6-v2)
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
    const embeddings = await generateEmbeddings([query]);

    if (!embeddings || embeddings.length === 0 || !embeddings[0]) {
        throw new Error("Failed to generate query embedding");
    }

    return embeddings[0];
}
