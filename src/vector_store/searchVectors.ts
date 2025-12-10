/**
 * ChromaDB에서 유사한 벡터를 검색하는 모듈입니다.
 */
import { ChromaClient } from "chromadb";
import { generateEmbeddings } from "../nlp/embedding/openaiEmbedding.js";

const client = new ChromaClient();

export interface SearchResult {
    id: string;
    content: string;
    score: number;
    metadata: any;
}

/**
 * 주어진 쿼리(질문)와 유사한 문서를 검색합니다.
 * 
 * @param {string} collectionName - 검색할 컬렉션 이름
 * @param {string} query - 사용자 질문
 * @param {number} nResults - 반환할 결과 개수 (기본값: 5)
 * @returns {Promise<SearchResult[]>} 검색 결과 리스트
 */
export async function searchVectors(
    collectionName: string,
    query: string,
    nResults: number = 5
): Promise<SearchResult[]> {
    try {
        const collection = await client.getCollection({ name: collectionName });

        // 1. 쿼리 텍스트를 임베딩으로 변환
        const embeddings = await generateEmbeddings([query]);
        if (!embeddings || embeddings.length === 0) {
            throw new Error("Failed to generate embedding for query");
        }
        const queryEmbedding = embeddings[0];

        // 2. 벡터 검색 수행
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding], // or use queryTexts if using built-in embedding function
            nResults: nResults,
        });

        // 3. 결과 포맷팅
        const mappedResults: SearchResult[] = [];

        if (results.ids && results.ids.length > 0) {
            const firstBatchIds = results.ids[0];
            const firstBatchDocs = results.documents?.[0];
            const firstBatchMetas = results.metadatas?.[0];
            const firstBatchDistances = results.distances?.[0];

            if (firstBatchIds) {
                for (let i = 0; i < firstBatchIds.length; i++) {
                    const id = firstBatchIds[i];
                    const content = firstBatchDocs ? firstBatchDocs[i] : null;
                    const metadata = firstBatchMetas ? firstBatchMetas[i] : null;
                    const distance = firstBatchDistances ? firstBatchDistances[i] : null;

                    mappedResults.push({
                        id: id,
                        content: content || "",
                        metadata: metadata,
                        score: distance !== null ? distance : 0
                    });
                }
            }
        }

        return mappedResults;

    } catch (error) {
        console.error("❌ searchVectors failed:", error);
        return [];
    }
}
