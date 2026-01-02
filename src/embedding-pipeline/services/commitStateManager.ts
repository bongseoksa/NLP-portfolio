import fs from "fs";
import path from "path";
import type { CommitStateStore, RepositoryCommitState } from "../../shared/models/TargetRepository.js";

/**
 * 커밋 상태 관리 서비스
 * 레포지토리별 마지막 처리 커밋을 추적하여 중복 임베딩을 방지합니다.
 */
export class CommitStateManager {
    private stateFilePath: string;
    private state: CommitStateStore;

    constructor(stateFilePath?: string) {
        this.stateFilePath = stateFilePath || path.join(process.cwd(), "commit-state.json");
        this.state = this.loadState();
    }

    /**
     * 상태 파일 로드 (없으면 초기화)
     */
    private loadState(): CommitStateStore {
        if (fs.existsSync(this.stateFilePath)) {
            try {
                const content = fs.readFileSync(this.stateFilePath, "utf-8");
                return JSON.parse(content);
            } catch (error) {
                console.warn(`⚠️  Failed to load commit state file, initializing new state:`, error);
            }
        }

        // 초기 상태
        return {
            repositories: {},
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * 상태 파일 저장
     */
    private saveState(): void {
        this.state.lastUpdated = new Date().toISOString();
        fs.writeFileSync(
            this.stateFilePath,
            JSON.stringify(this.state, null, 2),
            "utf-8"
        );
    }

    /**
     * 특정 레포지토리의 마지막 처리 커밋 조회
     * @returns 마지막 처리 커밋 SHA (없으면 null)
     */
    getLastProcessedCommit(owner: string, repo: string): string | null {
        const id = `${owner}/${repo}`;
        const repoState = this.state.repositories[id];
        return repoState?.lastProcessedCommit || null;
    }

    /**
     * 특정 레포지토리의 전체 상태 조회
     */
    getRepositoryState(owner: string, repo: string): RepositoryCommitState | null {
        const id = `${owner}/${repo}`;
        return this.state.repositories[id] || null;
    }

    /**
     * 레포지토리의 커밋 처리 완료 기록
     */
    updateProcessedCommit(
        owner: string,
        repo: string,
        commitSha: string,
        defaultBranch: string
    ): void {
        const id = `${owner}/${repo}`;
        const existing = this.state.repositories[id];

        this.state.repositories[id] = {
            id,
            owner,
            repo,
            defaultBranch,
            lastProcessedCommit: commitSha,
            lastProcessedAt: new Date().toISOString(),
            totalCommitsProcessed: (existing?.totalCommitsProcessed || 0) + 1
        };

        this.saveState();
    }

    /**
     * 특정 레포지토리의 상태 초기화 (강제 재임베딩용)
     */
    resetRepository(owner: string, repo: string): void {
        const id = `${owner}/${repo}`;
        delete this.state.repositories[id];
        this.saveState();
        console.log(`🔄 Reset commit state for ${id}`);
    }

    /**
     * 모든 레포지토리 상태 초기화
     */
    resetAll(): void {
        this.state = {
            repositories: {},
            lastUpdated: new Date().toISOString()
        };
        this.saveState();
        console.log(`🔄 Reset all commit states`);
    }

    /**
     * 전체 상태 조회
     */
    getAllStates(): CommitStateStore {
        return this.state;
    }

    /**
     * 상태 출력 (디버깅용)
     */
    printState(): void {
        console.log("\n📊 Commit State Summary:");
        console.log(`   Last updated: ${this.state.lastUpdated}`);
        console.log(`   Tracked repositories: ${Object.keys(this.state.repositories).length}`);

        if (Object.keys(this.state.repositories).length > 0) {
            console.log("\n   Repository States:");
            for (const [id, state] of Object.entries(this.state.repositories)) {
                console.log(`   - ${id}:`);
                console.log(`     Branch: ${state.defaultBranch}`);
                console.log(`     Last commit: ${state.lastProcessedCommit.substring(0, 7)}`);
                console.log(`     Last processed: ${state.lastProcessedAt}`);
                console.log(`     Total commits: ${state.totalCommitsProcessed}`);
            }
        }
    }
}
