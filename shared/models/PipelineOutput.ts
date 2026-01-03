import type { CommitItem } from "./Commit.js";
import type { FileModel } from "./File.js";

// RepositoryFile 타입 정의 (local-cli 제거로 인한 임시 정의)
export interface RepositoryFile {
    path: string;
    content: string;
    sha: string;
    size: number;
    type: string;
    extension?: string;
    chunkIndex?: number;
    totalChunks?: number;
}

/**
 * 전체 파이프라인 실행 결과 데이터를 집계하는 인터페이스입니다.
 * GitHub API를 통해 수집된 커밋 정보, 파일 변경 내역 (patch 포함), 레포지토리 파일을 포함합니다.
 */
export interface PipelineOutput {
    /** 수집된 커밋 목록 (GitHub API) */
    commits: CommitItem[];
    /** 커밋별 변경 파일 정보 맵 (key: SHA) - GitHub API에서 patch 포함 */
    commitFiles: Record<string, FileModel[]>;
    /** 레포지토리의 모든 파일 내용 (소스 코드) */
    repositoryFiles: RepositoryFile[];
}
