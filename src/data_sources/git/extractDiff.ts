import { exec } from "child_process";
import { promisify } from "util";
import type { LocalCommitLog } from "../../models/Commit.js";
import type { CommitDiff, FileDiff } from "../../models/Diff.js";

const execAsync = promisify(exec);

/**
 * 로컬 Git 저장소에서 `git show` 명령어를 사용하여 각 커밋의 상세 변경 내역(Diff)을 추출합니다.
 * 대용량 Diff 처리를 위해 maxBuffer 옵션이 증가되어 있습니다.
 * 
 * @param {LocalCommitLog[]} commits - Diff를 추출할 대상 커밋 목록
 * @returns {Promise<CommitDiff[]>} 각 커밋별 Diff 결과 리스트
 */
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
