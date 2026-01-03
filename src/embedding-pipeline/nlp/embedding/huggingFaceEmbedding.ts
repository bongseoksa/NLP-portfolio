/**
 * Hugging Face sentence-transformers/all-MiniLM-L6-v2 임베딩 생성
 * 기획서에 명시된 기술 스택에 맞춘 구현
 * 
 * Model: sentence-transformers/all-MiniLM-L6-v2
 * Provider: Hugging Face (@xenova/transformers)
 * Dimensions: 384
 * Cost: 무료 (로컬 실행)
 */
import { pipeline, env } from '@xenova/transformers';

// 모델 캐시 디렉토리 설정 (선택사항)
env.allowLocalModels = false; // 온라인 모델 사용

// 모델 초기화 (lazy loading)
let embedder: any = null;
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

/**
 * 임베딩 모델 초기화
 */
async function getEmbedder() {
    if (!embedder) {
        console.log(`🔄 Loading Hugging Face model: ${MODEL_NAME}...`);
        embedder = await pipeline('feature-extraction', MODEL_NAME, {
            quantized: true, // 메모리 최적화
        });
        console.log('✅ Hugging Face model loaded');
    }
    return embedder;
}

/**
 * 텍스트 목록에 대한 임베딩 벡터를 생성합니다.
 * 
 * @param {string[]} texts - 임베딩을 생성할 텍스트 목록
 * @returns {Promise<number[][]>} 생성된 임베딩 벡터 목록 (384 dimensions)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
        const model = await getEmbedder();
        console.log(`🔄 Generating embeddings with Hugging Face (${MODEL_NAME})...`);
        
        const embeddings: number[][] = [];
        
        // 배치 처리로 성능 최적화
        for (const text of texts) {
            const result = await model(text, { 
                pooling: 'mean', 
                normalize: true 
            });
            
            // Tensor를 배열로 변환
            // @xenova/transformers는 Tensor 객체를 반환하므로 .data 또는 .tolist() 사용
            let embedding: number[];
            
            // result가 Tensor 객체인 경우
            if (result && typeof result.tolist === 'function') {
                const listResult = result.tolist();
                // tolist()가 2차원 배열을 반환할 수 있으므로 평탄화
                if (Array.isArray(listResult) && listResult.length > 0 && Array.isArray(listResult[0])) {
                    embedding = listResult[0] as number[];
                } else {
                    embedding = listResult as number[];
                }
            } else if (result && Array.isArray(result)) {
                // 이미 배열인 경우
                if (result.length > 0 && Array.isArray(result[0])) {
                    // 2차원 배열인 경우 첫 번째 요소 사용
                    embedding = result[0] as number[];
                } else {
                    embedding = result as number[];
                }
            } else if (result && result.data) {
                // Tensor.data 속성이 있는 경우
                const data = result.data;
                if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
                    embedding = data[0] as number[];
                } else {
                    embedding = Array.from(data);
                }
            } else {
                // fallback: 직접 변환 시도
                const converted = Array.from(result as any);
                if (converted.length > 0 && Array.isArray(converted[0])) {
                    embedding = converted[0] as number[];
                } else {
                    embedding = converted as number[];
                }
            }
            
            // 차원 확인 (384)
            if (embedding.length !== 384) {
                console.warn(`⚠️ Unexpected embedding dimension: ${embedding.length}, expected 384`);
            }
            
            embeddings.push(embedding);
        }
        
        console.log(`✅ Generated ${embeddings.length} embeddings (384 dimensions each)`);
        return embeddings;
        
    } catch (error: any) {
        console.error('❌ Hugging Face embedding failed:', error.message);
        throw new Error(`Hugging Face embedding failed: ${error.message}`);
    }
}

/**
 * 텍스트 목록에 대한 임베딩 벡터와 토큰 사용량을 생성합니다.
 * Hugging Face는 토큰 카운팅을 제공하지 않으므로 0을 반환합니다.
 * 
 * @param {string[]} texts - 임베딩을 생성할 텍스트 목록
 * @returns {Promise<{embeddings: number[][], totalTokens: number}>} 생성된 임베딩 벡터 목록과 총 토큰 사용량
 */
export async function generateEmbeddingsWithUsage(texts: string[]): Promise<{
    embeddings: number[][];
    totalTokens: number;
}> {
    const embeddings = await generateEmbeddings(texts);
    return { embeddings, totalTokens: 0 }; // Hugging Face는 토큰 카운팅 없음
}

