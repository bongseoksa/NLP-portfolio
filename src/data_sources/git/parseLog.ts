import { exec } from "child_process";
import { promisify } from "util";
import type { LocalCommitLog } from "../../models/Commit.js";

const execAsync = promisify(exec);

/**
 * 로컬 Git 저장소에서 최근 N개의 커밋 로그를 `git log` 명령어로 가져와 파싱합니다.
 * 
 * @param {number} limit - 가져올 커밋 개수 (기본값: 20)
 * @returns {Promise<LocalCommitLog[]>} 파싱된 로컬 커밋 로그 리스트
 */
export async function parseLog(limit: number = 20): Promise<LocalCommitLog[]> {
    try {
        // Git 로그 출력 포맷 정의
        // %H: SHA
        // %an: Author name
        // %ad: Author date (ISO)
        // %s: Commit message
        const format = "%H|%an|%ad|%s";

        const cmd = `git log -n ${limit} --pretty=format:"${format}" --date=iso`;

        const { stdout } = await execAsync(cmd, {
            cwd: process.env.LOCAL_REPO_PATH || process.cwd(),
            maxBuffer: 1024 * 1024 * 10, // 10MB 버퍼 — diff가 많아도 안전
        });

        if (!stdout.trim()) {
            console.warn("⚠️ 로컬 저장소에서 git log 결과가 비어있습니다.");
            return [];
        }

        // 줄 단위로 분리
        const lines = stdout.split("\n");

        const commits: LocalCommitLog[] = lines.map((line) => {
            const [sha = "", author = "", date = "", message = ""] = line.split("|");

            return {
                sha,
                author,
                date,
                message,
            };
        });

        return commits;
    } catch (err: any) {
        console.error("❌ parseLog 실행 실패");
        console.error(err.message);

        if (err.stderr?.includes("fatal: not a git repository")) {
            console.error("❌ 현재 디렉토리는 Git 저장소가 아닙니다.");
        }

        return [];
    }
}
