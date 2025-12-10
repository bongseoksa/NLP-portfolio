// src/github/fetchFiles.ts

import { Octokit } from "@octokit/rest";
import type { FileModel } from "../../models/File.js";

const token = process.env.GITHUB_TOKEN;
if (!token) {
    throw new Error("❌ GITHUB_TOKEN이 .env에 없습니다.");
}

const octokit = new Octokit({ auth: token });

interface FetchFilesParams {
    owner: string;
    repo: string;
    sha: string;
}

/**
 * GitHub Commit API에서 특정 커밋의 파일 변경 목록을 가져옵니다.
 * 반환값은 FileModel[] 형태이며, 후속 파이프라인에서 diff 병합에 사용됩니다.
 * 
 * @param {FetchFilesParams} params - owner, repo, sha 정보
 * @returns {Promise<FileModel[]>} 변경된 파일 목록
 */
export async function fetchFiles({
    owner,
    repo,
    sha,
}: FetchFilesParams): Promise<FileModel[]> {
    try {
        const response = await octokit.request(
            "GET /repos/{owner}/{repo}/commits/{sha}",
            { owner, repo, sha }
        );

        const files = response.data.files;
        if (!files || files.length === 0) return [];

        const parsedFiles: FileModel[] = files.map((file: any) => {
            return {
                filename: file.filename,
                status: file.status, // added | modified | removed | renamed
                additions: file.additions ?? 0,
                deletions: file.deletions ?? 0,
                patch: file.patch || "",
            };
        });

        return parsedFiles;
    } catch (error: any) {
        console.error(`❌ fetchFiles 실패 (sha: ${sha})`);
        console.error(error?.message || error);
        return [];
    }
}
