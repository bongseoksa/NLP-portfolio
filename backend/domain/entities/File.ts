/**
 * GitHub API로부터 조회된 변경 파일 정보를 나타내는 모델입니다.
 */
export interface FileModel {
    /** 파일명 (경로 포함) */
    filename: string;
    /** 변경 상태 (예: "added", "modified", "removed", "renamed") */
    status: string;
    /** 추가된 라인 수 (Optional) */
    additions?: number;
    /** 삭제된 라인 수 (Optional) */
    deletions?: number;
    /** 변경 내용의 Patch 텍스트 (Optional) */
    patch?: string;
    /** (선택 사항) 파일의 원본 내용 */
    rawContent?: string;
}
