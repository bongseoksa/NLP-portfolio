export interface FileModel {
    filename: string;
    status: string;      // added | modified | removed
    additions?: number;
    deletions?: number;
    patch?: string;      // diff 내용
    rawContent?: string; // 선택: 원본 파일 내용
}
