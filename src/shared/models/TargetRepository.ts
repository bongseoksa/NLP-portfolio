/**
 * 임베딩 대상 레포지토리 정보
 */
export interface TargetRepository {
    /** GitHub repository owner (username or organization) */
    owner: string;
    /** GitHub repository name */
    repo: string;
    /** Whether this repository should be processed */
    enabled?: boolean;
    /** Optional description */
    description?: string;
}

/**
 * target-repos.json 파일 구조
 */
export interface TargetRepositoriesConfig {
    repositories: TargetRepository[];
}

/**
 * 레포지토리별 마지막 처리 커밋 상태
 */
export interface RepositoryCommitState {
    /** Repository identifier: {owner}/{repo} */
    id: string;
    /** Owner name */
    owner: string;
    /** Repository name */
    repo: string;
    /** Default branch name */
    defaultBranch: string;
    /** Last processed commit SHA */
    lastProcessedCommit: string;
    /** Timestamp of last processing (ISO 8601) */
    lastProcessedAt: string;
    /** Total commits processed */
    totalCommitsProcessed: number;
}

/**
 * 전체 커밋 상태 저장 파일 구조
 */
export interface CommitStateStore {
    /** Map of repository ID to commit state */
    repositories: Record<string, RepositoryCommitState>;
    /** Last updated timestamp */
    lastUpdated: string;
}
