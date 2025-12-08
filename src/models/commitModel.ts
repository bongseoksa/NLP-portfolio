import type { FileModel } from "./fileModel.js";

export interface CommitModel {
    sha: string;
    author: string;
    date: string;
    message: string;       // raw commit message
    title: string;         // 첫 줄
    description: string;   // 나머지 줄
    files: FileModel[];    // 나중에 fetchFiles에서 채워짐
}
