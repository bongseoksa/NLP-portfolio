/**
 * 단일 파일에 대한 변경 내역(Diff) 정보를 담는 인터페이스입니다.
 */
export interface FileDiff {
    /** 변경된 파일의 경로 */
    filePath: string;
    /** 추가된 라인 수 */
    additions: number;
    /** 삭제된 라인 수 */
    deletions: number;
    /** 파일의 변경된 patch 텍스트 (Diff 내용 전체) */
    patch: string;
}

/**
 * 특정 커밋의 전체 파일 변경 사항(Diff)을 나타내는 인터페이스입니다.
 */
export interface CommitDiff {
    /** 해당 Diff가 속한 커밋의 SHA */
    sha: string;
    /** 해당 커밋에서 변경된 파일들의 Diff 목록 */
    files: FileDiff[];
}
