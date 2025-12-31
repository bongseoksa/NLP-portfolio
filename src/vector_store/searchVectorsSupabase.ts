import { SupabaseVectorStore } from "./supabaseVectorStore.js";
import { generateEmbeddings } from "../nlp/embedding/openaiEmbedding.js";

export interface SearchResult {
    id: string;
    content: string;
    metadata: Record<string, any>;
    score: number;
}

/**
 * Supabase Vector Store에서 유사도 검색
 * ChromaDB searchVectors 대체
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

    // 1. 쿼리 임베딩 생성
    console.log("📝 Generating query embedding...");
    const embeddings = await generateEmbeddings([query]);

    if (embeddings.length === 0 || !embeddings[0]) {
        throw new Error("Failed to generate query embedding");
    }

    const queryEmbedding = embeddings[0];

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
