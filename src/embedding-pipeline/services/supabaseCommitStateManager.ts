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
        
        // 테이블 자동 생성 시도 (비동기, 실패해도 계속 진행)
        this.ensureTableExists().catch((err) => {
            console.warn('⚠️ commit_states 테이블 자동 생성 실패:', err.message);
        });
    }

    /**
     * commit_states 테이블이 없으면 자동 생성
     */
    private async ensureTableExists(): Promise<void> {
        // 테이블 존재 여부 확인
        const { error: checkError } = await this.supabase
            .from('commit_states')
            .select('id')
            .limit(1);

        if (!checkError) {
            // 테이블이 이미 존재
            return;
        }

        // 테이블이 없으면 생성 시도
        if (checkError.code === 'PGRST205' || checkError.message?.includes('does not exist')) {
            console.log('📋 commit_states 테이블이 없습니다. 자동 생성을 시도합니다...');
            
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS commit_states (
                    id TEXT PRIMARY KEY,
                    owner TEXT NOT NULL,
                    repo TEXT NOT NULL,
                    default_branch TEXT NOT NULL DEFAULT 'main',
                    last_processed_commit TEXT NOT NULL,
                    last_processed_at TIMESTAMPTZ NOT NULL,
                    total_commits_processed INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(owner, repo)
                );

                CREATE INDEX IF NOT EXISTS idx_commit_states_owner_repo ON commit_states(owner, repo);
                CREATE INDEX IF NOT EXISTS idx_commit_states_updated_at ON commit_states(updated_at DESC);

                CREATE OR REPLACE FUNCTION update_commit_states_updated_at()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = NOW();
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                DROP TRIGGER IF EXISTS update_commit_states_updated_at_trigger ON commit_states;
                CREATE TRIGGER update_commit_states_updated_at_trigger
                    BEFORE UPDATE ON commit_states
                    FOR EACH ROW
                    EXECUTE FUNCTION update_commit_states_updated_at();
            `;

            // Service Role Key로 직접 SQL 실행 시도
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (serviceRoleKey) {
                try {
                    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': serviceRoleKey,
                            'Authorization': `Bearer ${serviceRoleKey}`,
                        },
                        body: JSON.stringify({ sql: createTableSQL }),
                    });

                    if (response.ok) {
                        console.log('✅ commit_states 테이블 생성 성공');
                        return;
                    }
                } catch (err: any) {
                    console.warn('⚠️ RPC를 통한 테이블 생성 실패, 수동 생성 필요:', err.message);
                }
            }

            // 자동 생성 실패 시 사용자에게 안내
            console.warn('⚠️ commit_states 테이블을 수동으로 생성해야 합니다.');
            console.warn('   Supabase SQL Editor에서 다음을 실행하세요:');
            console.warn('   CREATE TABLE commit_states (...);');
        }
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
            
            // 테이블이 없으면 null 반환 (첫 실행으로 간주)
            if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
                console.warn(`⚠️ commit_states 테이블이 없습니다. 첫 실행으로 간주합니다.`);
                console.warn(`   Supabase SQL Editor에서 다음을 실행하세요:`);
                console.warn(`   CREATE TABLE commit_states (...);`);
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
            
            // 테이블이 없으면 null 반환 (첫 실행으로 간주)
            if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
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
            // 테이블이 없으면 경고만 출력 (첫 실행 시)
            if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
                console.warn(`⚠️ commit_states 테이블이 없어 상태를 저장할 수 없습니다.`);
                console.warn(`   Supabase SQL Editor에서 테이블을 생성하세요.`);
                return;
            }
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
            // 테이블이 없으면 빈 배열 반환 (첫 실행으로 간주)
            if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
                console.warn(`⚠️ commit_states 테이블이 없습니다. 빈 상태로 시작합니다.`);
                return [];
            }
            // 다른 에러도 경고만 출력하고 빈 배열 반환 (에러로 인한 파이프라인 중단 방지)
            console.warn(`⚠️ Failed to get all states: ${error.message}`);
            return [];
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
