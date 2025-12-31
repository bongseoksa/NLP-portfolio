import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { RepositoryCommitState } from "../../shared/models/TargetRepository.js";

/**
 * Supabase 기반 Commit 상태 관리 서비스
 * commit-state.json 파일을 Supabase 테이블로 대체 (서버리스 호환)
 */
export class SupabaseCommitStateManager {
    private supabase: SupabaseClient;

    constructor(supabaseUrl?: string, supabaseKey?: string) {
        const url = supabaseUrl || process.env.SUPABASE_URL;
        const key = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

        if (!url || !key) {
            throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
        }

        this.supabase = createClient(url, key);
    }

    /**
     * 특정 레포지토리의 마지막 처리 커밋 조회
     */
    async getLastProcessedCommit(owner: string, repo: string): Promise<string | null> {
        const id = `${owner}/${repo}`;

        const { data, error } = await this.supabase
            .from('commit_states')
            .select('last_processed_commit')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // Not found - 첫 실행
                return null;
            }
            throw new Error(`Failed to get last processed commit: ${error.message}`);
        }

        return data?.last_processed_commit || null;
    }

    /**
     * 특정 레포지토리의 전체 상태 조회
     */
    async getRepositoryState(owner: string, repo: string): Promise<RepositoryCommitState | null> {
        const id = `${owner}/${repo}`;

        const { data, error } = await this.supabase
            .from('commit_states')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw new Error(`Failed to get repository state: ${error.message}`);
        }

        if (!data) return null;

        return {
            id: data.id,
            owner: data.owner,
            repo: data.repo,
            defaultBranch: data.default_branch,
            lastProcessedCommit: data.last_processed_commit,
            lastProcessedAt: data.last_processed_at,
            totalCommitsProcessed: data.total_commits_processed
        };
    }

    /**
     * 레포지토리의 커밋 처리 완료 기록
     */
    async updateProcessedCommit(
        owner: string,
        repo: string,
        commitSha: string,
        defaultBranch: string
    ): Promise<void> {
        const id = `${owner}/${repo}`;

        // 기존 상태 조회
        const existing = await this.getRepositoryState(owner, repo);

        const { error } = await this.supabase
            .from('commit_states')
            .upsert({
                id,
                owner,
                repo,
                default_branch: defaultBranch,
                last_processed_commit: commitSha,
                last_processed_at: new Date().toISOString(),
                total_commits_processed: (existing?.totalCommitsProcessed || 0) + 1
            }, {
                onConflict: 'id'
            });

        if (error) {
            throw new Error(`Failed to update processed commit: ${error.message}`);
        }

        console.log(`✅ Updated commit state for ${id}: ${commitSha.substring(0, 7)}`);
    }

    /**
     * 특정 레포지토리의 상태 초기화 (강제 재임베딩용)
     */
    async resetRepository(owner: string, repo: string): Promise<void> {
        const id = `${owner}/${repo}`;

        const { error } = await this.supabase
            .from('commit_states')
            .delete()
            .eq('id', id);

        if (error) {
            throw new Error(`Failed to reset repository: ${error.message}`);
        }

        console.log(`🔄 Reset commit state for ${id}`);
    }

    /**
     * 모든 레포지토리 상태 초기화
     */
    async resetAll(): Promise<void> {
        const { error } = await this.supabase
            .from('commit_states')
            .delete()
            .neq('id', '');  // 모든 행 삭제

        if (error) {
            throw new Error(`Failed to reset all commit states: ${error.message}`);
        }

        console.log(`🔄 Reset all commit states`);
    }

    /**
     * 전체 상태 조회
     */
    async getAllStates(): Promise<RepositoryCommitState[]> {
        const { data, error } = await this.supabase
            .from('commit_states')
            .select('*')
            .order('last_processed_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to get all states: ${error.message}`);
        }

        if (!data) return [];

        return data.map((row: any) => ({
            id: row.id,
            owner: row.owner,
            repo: row.repo,
            defaultBranch: row.default_branch,
            lastProcessedCommit: row.last_processed_commit,
            lastProcessedAt: row.last_processed_at,
            totalCommitsProcessed: row.total_commits_processed
        }));
    }

    /**
     * 상태 출력 (디버깅용)
     */
    async printState(): Promise<void> {
        const states = await this.getAllStates();

        console.log("\n📊 Commit State Summary (Supabase):");
        console.log(`   Tracked repositories: ${states.length}`);

        if (states.length > 0) {
            console.log("\n   Repository States:");
            for (const state of states) {
                console.log(`   - ${state.id}:`);
                console.log(`     Branch: ${state.defaultBranch}`);
                console.log(`     Last commit: ${state.lastProcessedCommit.substring(0, 7)}`);
                console.log(`     Last processed: ${state.lastProcessedAt}`);
                console.log(`     Total commits: ${state.totalCommitsProcessed}`);
            }
        }
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            const { error } = await this.supabase
                .from('commit_states')
                .select('id', { count: 'exact', head: true })
                .limit(1);

            return !error;
        } catch (error) {
            return false;
        }
    }
}
