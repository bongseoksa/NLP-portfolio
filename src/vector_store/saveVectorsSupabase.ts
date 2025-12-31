import { SupabaseVectorStore } from "./supabaseVectorStore.js";
import type { EmbeddingItem } from "../models/EmbeddingItem.js";

export interface SaveVectorsOptions {
    /** 기존 컬렉션 삭제 후 새로 생성 (reset 모드) */
    reset?: boolean;
    /** Repository owner (reset 시 필요) */
    owner?: string;
    /** Repository name (reset 시 필요) */
    repo?: string;
}

/**
 * Supabase Vector Store에 임베딩 저장
 * ChromaDB saveVectors 대체
 */
export async function saveVectorsSupabase(
    items: EmbeddingItem[],
    options: SaveVectorsOptions = {}
): Promise<void> {
    const { reset = false, owner, repo } = options;

    console.log("\n📌 Saving to Supabase Vector Store...");

    const vectorStore = new SupabaseVectorStore();

    // Reset 모드: 기존 데이터 삭제
    if (reset && owner && repo) {
        console.log(`🔄 Reset mode: Deleting existing embeddings for ${owner}/${repo}...`);
        await vectorStore.deleteByRepository(owner, repo);
    }

    // 데이터 변환: EmbeddingItem → Supabase 형식
    const supabaseItems = items.map(item => ({
        id: item.id,
        content: item.content,
        embedding: item.embedding,
        metadata: item.metadata
    }));

    // Supabase에 저장
    console.log(`📤 Upserting ${supabaseItems.length} items to Supabase...`);
    await vectorStore.saveEmbeddings(supabaseItems);

    // 저장 확인
    if (owner && repo) {
        const count = await vectorStore.countByRepository(owner, repo);
        console.log(`✅ Total embeddings for ${owner}/${repo}: ${count}`);
    } else {
        const totalCount = await vectorStore.countAll();
        console.log(`✅ Total embeddings in store: ${totalCount}`);
    }

    console.log("✔ Vector storage save completed.\n");
}
