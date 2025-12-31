import { Octokit } from "@octokit/rest";
import type { TargetRepository, TargetRepositoriesConfig } from "../../shared/models/TargetRepository.js";
import { SupabaseCommitStateManager } from "./supabaseCommitStateManager.js";

/**
 * 폴링 결과: 처리 필요 여부 및 관련 정보
 */
export interface PollingResult {
    /** Repository identifier */
    id: string;
    /** Owner name */
    owner: string;
    /** Repository name */
    repo: string;
    /** Default branch name */
    defaultBranch: string;
    /** Latest commit SHA */
    latestCommit: string;
    /** Last processed commit SHA (null if never processed) */
    lastProcessedCommit: string | null;
    /** Whether processing is needed */
    needsProcessing: boolean;
    /** Reason for processing or skipping */
    reason: string;
}

/**
 * Supabase 기반 레포지토리 폴링 서비스
 * 파일 시스템 의존성 제거 - 완전 Serverless 호환
 */
export class RepositoryPollerSupabase {
    private octokit: Octokit;
    private stateManager: SupabaseCommitStateManager;

    constructor(githubToken?: string) {
        const token = githubToken || process.env.GITHUB_TOKEN;
        if (!token) {
            throw new Error("GITHUB_TOKEN is required for RepositoryPollerSupabase");
        }

        this.octokit = new Octokit({ auth: token });
        this.stateManager = new SupabaseCommitStateManager();
    }

    /**
     * 환경 변수에서 대상 레포지토리 로드
     * target-repos.json 제거 (Serverless 호환)
     */
    private loadTargetRepositories(): TargetRepository[] {
        const owner = process.env.TARGET_REPO_OWNER;
        const repo = process.env.TARGET_REPO_NAME;

        if (!owner || !repo) {
            throw new Error(
                `TARGET_REPO_OWNER and TARGET_REPO_NAME environment variables are required`
            );
        }

        console.log(`📌 Using repository from environment variables: ${owner}/${repo}`);

        return [
            {
                owner,
                repo,
                enabled: true,
                description: "From environment variables"
            }
        ];
    }

    /**
     * 특정 레포지토리의 기본 브랜치 조회
     */
    private async getDefaultBranch(owner: string, repo: string): Promise<string> {
        try {
            const { data } = await this.octokit.rest.repos.get({
                owner,
                repo
            });

            return data.default_branch;
        } catch (error: any) {
            throw new Error(`Failed to get default branch for ${owner}/${repo}: ${error.message}`);
        }
    }

    /**
     * 특정 레포지토리의 최신 커밋 SHA 조회
     */
    private async getLatestCommit(owner: string, repo: string, branch: string): Promise<string> {
        try {
            const { data } = await this.octokit.rest.repos.listCommits({
                owner,
                repo,
                sha: branch,
                per_page: 1
            });

            if (data.length === 0) {
                throw new Error(`No commits found in ${owner}/${repo}@${branch}`);
            }

            const firstCommit = data[0];
            if (!firstCommit) {
                throw new Error(`Invalid commit data for ${owner}/${repo}@${branch}`);
            }

            return firstCommit.sha;
        } catch (error: any) {
            throw new Error(`Failed to get latest commit for ${owner}/${repo}@${branch}: ${error.message}`);
        }
    }

    /**
     * 단일 레포지토리 폴링
     */
    async pollRepository(owner: string, repo: string): Promise<PollingResult> {
        const id = `${owner}/${repo}`;

        console.log(`\n🔍 Polling ${id}...`);

        // 1. 기본 브랜치 조회
        const defaultBranch = await this.getDefaultBranch(owner, repo);
        console.log(`   Default branch: ${defaultBranch}`);

        // 2. 최신 커밋 조회
        const latestCommit = await this.getLatestCommit(owner, repo, defaultBranch);
        console.log(`   Latest commit: ${latestCommit.substring(0, 7)}`);

        // 3. 마지막 처리 커밋 조회 (Supabase)
        const lastProcessedCommit = await this.stateManager.getLastProcessedCommit(owner, repo);

        if (lastProcessedCommit) {
            console.log(`   Last processed: ${lastProcessedCommit.substring(0, 7)}`);
        } else {
            console.log(`   Last processed: (none - first run)`);
        }

        // 4. 처리 필요 여부 판단
        const needsProcessing = !lastProcessedCommit || lastProcessedCommit !== latestCommit;
        const reason = needsProcessing
            ? lastProcessedCommit
                ? `New commit detected: ${lastProcessedCommit.substring(0, 7)} → ${latestCommit.substring(0, 7)}`
                : "First run: no previous commit recorded"
            : "Up to date: no new commits";

        console.log(`   ${needsProcessing ? "✅ Needs processing" : "⏭️  Skipping"}: ${reason}`);

        return {
            id,
            owner,
            repo,
            defaultBranch,
            latestCommit,
            lastProcessedCommit,
            needsProcessing,
            reason
        };
    }

    /**
     * 모든 대상 레포지토리 폴링
     */
    async pollAll(): Promise<PollingResult[]> {
        console.log("\n📡 Polling Target Repositories...");

        const targets = this.loadTargetRepositories();
        console.log(`   Found ${targets.length} repository from environment variables`);

        const results: PollingResult[] = [];

        for (const target of targets) {
            try {
                const result = await this.pollRepository(target.owner, target.repo);
                results.push(result);
            } catch (error: any) {
                console.error(`❌ Failed to poll ${target.owner}/${target.repo}:`, error.message);
                // Continue with other repositories
            }
        }

        return results;
    }

    /**
     * 폴링 결과 중 처리 필요한 레포지토리만 필터링
     */
    getRepositoriesToProcess(results: PollingResult[]): PollingResult[] {
        return results.filter(r => r.needsProcessing);
    }

    /**
     * 커밋 처리 완료 후 상태 업데이트 (Supabase)
     */
    async markAsProcessed(result: PollingResult): Promise<void> {
        await this.stateManager.updateProcessedCommit(
            result.owner,
            result.repo,
            result.latestCommit,
            result.defaultBranch
        );
        console.log(`✅ Marked ${result.id} as processed (${result.latestCommit.substring(0, 7)})`);
    }

    /**
     * 상태 초기화 (--reset 옵션용)
     */
    async resetState(owner?: string, repo?: string): Promise<void> {
        if (owner && repo) {
            await this.stateManager.resetRepository(owner, repo);
        } else {
            await this.stateManager.resetAll();
        }
    }

    /**
     * 현재 상태 출력 (Supabase)
     */
    async printState(): Promise<void> {
        await this.stateManager.printState();
    }

    /**
     * SupabaseCommitStateManager 인스턴스 반환
     */
    getStateManager(): SupabaseCommitStateManager {
        return this.stateManager;
    }
}
