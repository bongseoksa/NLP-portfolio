import { Octokit } from "@octokit/rest";
import fs from "fs";
import path from "path";
import type { TargetRepository, TargetRepositoriesConfig } from "../../shared/models/TargetRepository.js";
import { CommitStateManager } from "./commitStateManager.js";

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
 * 레포지토리 폴링 서비스
 * GitHub API를 사용하여 대상 레포지토리의 변경사항을 감지합니다.
 */
export class RepositoryPoller {
    private octokit: Octokit;
    private stateManager: CommitStateManager;
    private configPath: string;

    constructor(githubToken?: string, commitStateFilePath?: string, configPath?: string) {
        const token = githubToken || process.env.GITHUB_TOKEN;
        if (!token) {
            throw new Error("GITHUB_TOKEN is required for RepositoryPoller");
        }

        this.octokit = new Octokit({ auth: token });
        this.stateManager = new CommitStateManager(commitStateFilePath);
        this.configPath = configPath || path.join(process.cwd(), "target-repos.json");
    }

    /**
     * target-repos.json 로드
     * 파일이 없으면 환경 변수에서 단일 레포 로드 (fallback)
     */
    private loadTargetRepositories(): TargetRepository[] {
        // 1. target-repos.json 파일이 있으면 사용
        if (fs.existsSync(this.configPath)) {
            try {
                const content = fs.readFileSync(this.configPath, "utf-8");
                const config: TargetRepositoriesConfig = JSON.parse(content);

                // enabled가 false인 레포지토리 제외
                const repos = config.repositories.filter(repo => repo.enabled !== false);

                if (repos.length === 0) {
                    console.warn(`⚠️  No enabled repositories in ${this.configPath}, falling back to env vars`);
                } else {
                    console.log(`📄 Loaded ${repos.length} repositories from ${this.configPath}`);
                    return repos;
                }
            } catch (error) {
                console.warn(`⚠️  Failed to load ${this.configPath}: ${error}`);
                console.warn("   Falling back to environment variables...");
            }
        }

        // 2. Fallback: 환경 변수에서 단일 레포 로드
        const owner = process.env.TARGET_REPO_OWNER;
        const repo = process.env.TARGET_REPO_NAME;

        if (!owner || !repo) {
            throw new Error(
                `Neither ${this.configPath} nor TARGET_REPO_OWNER/TARGET_REPO_NAME env vars found. ` +
                `Please provide target repositories via config file or environment variables.`
            );
        }

        console.log(`📌 Using single repository from environment variables: ${owner}/${repo}`);

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

        // 3. 마지막 처리 커밋 조회
        const lastProcessedCommit = this.stateManager.getLastProcessedCommit(owner, repo);

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
        console.log(`   Found ${targets.length} enabled repositories in ${this.configPath}`);

        const results: PollingResult[] = [];

        for (const target of targets) {
            try {
                const result = await this.pollRepository(target.owner, target.repo);
                results.push(result);
            } catch (error: any) {
                console.error(`❌ Failed to poll ${target.owner}/${target.repo}:`, error.message);
                // Continue with other repositories even if one fails
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
     * 커밋 처리 완료 후 상태 업데이트
     */
    markAsProcessed(result: PollingResult): void {
        this.stateManager.updateProcessedCommit(
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
    resetState(owner?: string, repo?: string): void {
        if (owner && repo) {
            this.stateManager.resetRepository(owner, repo);
        } else {
            this.stateManager.resetAll();
        }
    }

    /**
     * 현재 상태 출력
     */
    printState(): void {
        this.stateManager.printState();
    }

    /**
     * CommitStateManager 인스턴스 반환
     */
    getStateManager(): CommitStateManager {
        return this.stateManager;
    }
}
