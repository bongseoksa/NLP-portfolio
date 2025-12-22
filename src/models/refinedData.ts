/**
 * NLP 임베딩을 위해 정제된 개별 데이터 아이템입니다.
 */
export interface RefinedItem {
    /** 고유 식별자 (예: Commit SHA 또는 파일 경로) */
    id: string;
    /** 데이터 타입 */
    type: "commit" | "diff" | "file";
    /** 임베딩 생성을 위한 전체 텍스트 청크 */
    content: string;
    /** 임베딩 최적화를 위한 자연어 변환 텍스트 */
    embeddingText: string;
    /** 데이터에 대한 메타데이터 */
    metadata: {
        // 커밋 관련 메타데이터
        /** 커밋 SHA */
        sha?: string;
        /** 작성자 */
        author?: string;
        /** 날짜 */
        date?: string;
        /** 커밋 메시지 */
        message?: string;
        /** 영향받은 파일 경로들 */
        affectedFiles?: string[];
        /** 변경된 파일 수 */
        fileCount?: number;
        /** 총 추가된 라인 수 */
        additions?: number;
        /** 총 삭제된 라인 수 */
        deletions?: number;
        // Diff 관련 메타데이터
        /** 이 Diff가 속한 커밋 ID */
        commitId?: string;
        /** Diff의 파일 경로 */
        filePath?: string;
        /** Diff 타입 */
        diffType?: "add" | "modify" | "delete" | "rename";
        /** 파일별 추가된 라인 수 */
        fileAdditions?: number;
        /** 파일별 삭제된 라인 수 */
        fileDeletions?: number;
        /** 변경 카테고리 */
        changeCategory?: "feat" | "fix" | "refactor" | "docs" | "style" | "test" | "chore";
        /** 의미론적 힌트 */
        semanticHint?: string[];
        // 파일 관련 메타데이터
        /** 파일 경로 */
        path?: string;
        /** 파일 타입 */
        fileType?: string;
        /** 파일 크기 */
        size?: number;
        /** 파일 확장자 */
        extension?: string;
        /** 청크 인덱스 (파일이 분할된 경우) */
        chunkIndex?: number;
        /** 전체 청크 수 (파일이 분할된 경우) */
        totalChunks?: number;
    };
}

/**
 * 정제된 데이터의 전체 컬렉션을 나타내는 인터페이스입니다.
 */
export interface RefinedData {
    /** 정제된 아이템 목록 */
    items: RefinedItem[];
}
