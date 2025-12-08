import { exec } from "child_process";
import { promisify } from "util";
import type { LocalCommitLog } from "./parseLog.js";

const execAsync = promisify(exec);

export interface FileDiff {
    filePath: string;
    additions: number;
    deletions: number;
    patch: string; // 전체 diff 텍스트
}

export interface CommitDiff {
    sha: string;
    files: FileDiff[];
}

export async function extractDiff(commits: LocalCommitLog[]): Promise<CommitDiff[]> {
    const results: CommitDiff[] = [];

    for (const commit of commits) {
        try {
            const cmd = `git show ${commit.sha} --numstat --patch`;

            const { stdout } = await execAsync(cmd, {
                cwd: process.env.LOCAL_REPO_PATH || process.cwd(),
                maxBuffer: 1024 * 1024 * 20, // 20MB 버퍼 (대규모 diff 대비)
            });

            const lines = stdout.split("\n");

            const fileDiffs: FileDiff[] = [];

            let currentPatch = "";
            let currentFile: FileDiff | null = null;

            for (const line of lines) {
                // numstat 라인: "12    4    src/App.tsx"
                const numstatMatch = line.match(/^(\d+|-)\s+(\d+|-)\s+(.*)$/);

                if (numstatMatch) {
                    // 파일 변경 정보 라인 → 새로운 파일 시작
                    if (currentFile && currentPatch) {
                        currentFile.patch = currentPatch.trim();
                        fileDiffs.push(currentFile);
                    }

                    const [, addStr = "", delStr = "", filePath = ""] = numstatMatch;

                    currentFile = {
                        filePath,
                        additions: addStr === "-" ? 0 : parseInt(addStr),
                        deletions: delStr === "-" ? 0 : parseInt(delStr),
                        patch: "",
                    };

                    currentPatch = "";
                    continue;
                }

                // patch 내용은 "@@" 로 시작
                if (line.startsWith("@@")) {
                    currentPatch += line + "\n";
                    continue;
                }

                // 나머지 diff 본문(+, -, 공백) 이어붙이기
                if (currentFile) {
                    currentPatch += line + "\n";
                }
            }

            // 마지막 파일 마무리 push
            if (currentFile && currentPatch) {
                currentFile.patch = currentPatch.trim();
                fileDiffs.push(currentFile);
            }

            results.push({
                sha: commit.sha,
                files: fileDiffs,
            });

        } catch (err: any) {
            console.error(`❌ extractDiff 실패: ${commit.sha}`);
            console.error(err.message);
            continue;
        }
    }

    return results;
}
