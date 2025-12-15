import type { CommitItem, LocalCommitLog } from "./Commit.js";
import type { FileModel } from "./File.js";
import type { CommitDiff } from "./Diff.js";
import type { RepositoryFile } from "../data_sources/github/fetchRepositoryFiles.js";

/**
 * 전체 파이프라인 실행 결과 데이터를 집계하는 인터페이스입니다.
 * 수집된 모든 커밋 정보, 파일 변경 내역, Diff, 로컬 로그, 레포지토리 파일을 포함합니다.
 */
export interface PipelineOutput {
    /** 수집된 커밋 목록 (GitHub API) */
    commits: CommitItem[];
    /** 커밋별 변경 파일 정보 맵 (key: SHA) */
    commitFiles: Record<string, FileModel[]>;
    /** 커밋별 Diff 정보 목록 */
    commitDiffs: CommitDiff[];
    /** 로컬 Git 로그 목록 */
    localLogs: LocalCommitLog[];
    /** 레포지토리의 모든 파일 내용 (소스 코드) */
    repositoryFiles: RepositoryFile[];
}
