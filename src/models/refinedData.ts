/**
 * NLP 임베딩을 위해 정제된 개별 데이터 아이템입니다.
 */
export interface RefinedItem {
    /** 고유 식별자 (예: Commit SHA 또는 파일 경로) */
    id: string;
    /** 데이터 타입 */
    type: "commit" | "file";
    /** 임베딩 생성을 위한 전체 텍스트 청크 */
    content: string;
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
        /** 변경된 파일 수 */
        fileCount?: number;
        // 파일 관련 메타데이터
        /** 파일 경로 */
        path?: string;
        /** 파일 타입 */
        type?: string;
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
