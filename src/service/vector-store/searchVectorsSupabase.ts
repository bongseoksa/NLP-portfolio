import { SupabaseVectorStore } from "../../embedding-pipeline/storage/supabaseVectorStore.js";
import { generateQueryEmbedding } from "./embeddingService.js";
import type { SearchResult } from "../../shared/models/SearchResult.js";

// Re-export for backward compatibility
export type { SearchResult };

/**
 * Supabase Vector Store에서 유사도 검색
 * ChromaDB searchVectors 대체
 *
 * 주의: 이 모듈은 검색만 수행합니다. 임베딩 생성은 embeddingService를 사용합니다.
 */
export async function searchVectorsSupabase(
    query: string,
    topK: number = 5,
    options?: {
        threshold?: number;
        filterMetadata?: Record<string, any>;
    }
): Promise<SearchResult[]> {
    const { threshold = 0.0, filterMetadata } = options || {};

    console.log(`\n🔍 Searching Supabase Vector Store for: "${query}"`);
    console.log(`   → Top K: ${topK}, Threshold: ${threshold}`);

    // 1. 쿼리 임베딩 생성 (외부 서비스 사용)
    console.log("📝 Generating query embedding...");
    const queryEmbedding = await generateQueryEmbedding(query);

    // 2. Supabase에서 유사도 검색
    const vectorStore = new SupabaseVectorStore();
    const searchOptions: {
        topK: number;
        threshold: number;
        filterMetadata?: Record<string, any>;
    } = {
        topK,
        threshold
    };

    if (filterMetadata) {
        searchOptions.filterMetadata = filterMetadata;
    }

    const results = await vectorStore.searchSimilar(queryEmbedding, searchOptions);

    // 3. 결과 변환
    const searchResults: SearchResult[] = results.map(result => ({
        id: result.id,
        content: result.content,
        metadata: result.metadata,
        score: result.similarity  // 0-1 (높을수록 유사)
    }));

    console.log(`✅ Found ${searchResults.length} results\n`);

    if (searchResults.length > 0) {
        console.log("📊 Top results:");
        searchResults.slice(0, 3).forEach((result, idx) => {
            const preview = result.content.substring(0, 100).replace(/\n/g, ' ');
            console.log(`   ${idx + 1}. [${result.score.toFixed(3)}] ${preview}...`);
        });
        console.log("");
    }

    return searchResults;
}
