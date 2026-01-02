import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Vector Store Client
 * ChromaDB 대체 - pgvector 기반 벡터 검색
 */
export class SupabaseVectorStore {
    private supabase: SupabaseClient;

    constructor(supabaseUrl?: string, supabaseKey?: string) {
        const url = supabaseUrl || process.env.SUPABASE_URL;
        const key = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

        if (!url || !key) {
            throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) are required");
        }

        this.supabase = createClient(url, key);
    }

    /**
     * 벡터 저장 (upsert)
     */
    async saveEmbeddings(items: Array<{
        id: string;
        content: string;
        embedding: number[];
        metadata: Record<string, any>;
    }>): Promise<void> {
        console.log(`📤 Upserting ${items.length} embeddings to Supabase...`);

        // 배치 크기 제한 (Supabase 권장: 1000개)
        const batchSize = 1000;
        let processedCount = 0;

        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);

            const { error } = await this.supabase
                .from('embeddings')
                .upsert(batch, {
                    onConflict: 'id'
                });

            if (error) {
                throw new Error(`Failed to upsert embeddings: ${error.message}`);
            }

            processedCount += batch.length;
            console.log(`   → ${processedCount}/${items.length} embeddings upserted`);
        }

        console.log(`✅ All ${items.length} embeddings saved to Supabase`);
    }

    /**
     * 벡터 유사도 검색
     */
    async searchSimilar(
        queryEmbedding: number[],
        options?: {
            topK?: number;
            threshold?: number;
            filterMetadata?: Record<string, any>;
        }
    ): Promise<Array<{
        id: string;
        content: string;
        metadata: Record<string, any>;
        similarity: number;
    }>> {
        const { topK = 5, threshold = 0.0, filterMetadata = {} } = options || {};

        console.log(`🔍 Searching for top ${topK} similar embeddings (threshold: ${threshold})...`);

        const { data, error } = await this.supabase.rpc('match_embeddings', {
            query_embedding: queryEmbedding,
            match_threshold: threshold,
            match_count: topK,
            filter_metadata: filterMetadata
        });

        if (error) {
            throw new Error(`Failed to search embeddings: ${error.message}`);
        }

        if (!data || data.length === 0) {
            console.log(`⚠️  No embeddings found matching the query`);
            return [];
        }

        console.log(`✅ Found ${data.length} similar embeddings`);

        return data.map((item: any) => ({
            id: item.id,
            content: item.content,
            metadata: item.metadata,
            similarity: item.similarity
        }));
    }

    /**
     * 특정 레포지토리의 모든 임베딩 삭제
     */
    async deleteByRepository(owner: string, repo: string): Promise<number> {
        console.log(`🗑️  Deleting all embeddings for ${owner}/${repo}...`);

        const { data, error } = await this.supabase.rpc('delete_embeddings_by_repo', {
            repo_owner: owner,
            repo_name: repo
        });

        if (error) {
            throw new Error(`Failed to delete embeddings: ${error.message}`);
        }

        const deletedCount = data as number;
        console.log(`✅ Deleted ${deletedCount} embeddings for ${owner}/${repo}`);

        return deletedCount;
    }

    /**
     * 특정 레포지토리의 임베딩 개수 조회
     */
    async countByRepository(owner: string, repo: string): Promise<number> {
        const { data, error } = await this.supabase.rpc('count_embeddings_by_repo', {
            repo_owner: owner,
            repo_name: repo
        });

        if (error) {
            throw new Error(`Failed to count embeddings: ${error.message}`);
        }

        return data as number;
    }

    /**
     * 전체 임베딩 개수 조회
     */
    async countAll(): Promise<number> {
        const { count, error } = await this.supabase
            .from('embeddings')
            .select('*', { count: 'exact', head: true });

        if (error) {
            throw new Error(`Failed to count all embeddings: ${error.message}`);
        }

        return count || 0;
    }

    /**
     * 모든 임베딩 조회 (파일 내보내기용)
     */
    async getAllEmbeddings(filter?: { owner?: string; repo?: string }): Promise<Array<{
        id: string;
        content: string;
        embedding: number[];
        metadata: Record<string, any>;
    }>> {
        console.log("📥 Fetching all embeddings from Supabase...");

        let query = this.supabase
            .from('embeddings')
            .select('id, content, embedding, metadata');

        // 필터 적용
        if (filter?.owner) {
            query = query.eq('metadata->>owner', filter.owner);
        }
        if (filter?.repo) {
            query = query.eq('metadata->>repo', filter.repo);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`Failed to fetch embeddings: ${error.message}`);
        }

        console.log(`   → Fetched ${data?.length || 0} embeddings`);

        return data || [];
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            const { data, error } = await this.supabase
                .from('embeddings')
                .select('id', { count: 'exact', head: true })
                .limit(1);

            return !error;
        } catch (error) {
            return false;
        }
    }
}
