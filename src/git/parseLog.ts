import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface LocalCommitLog {
    sha: string;
    author: string;
    date: string;
    message: string;
}

/**
 * 로컬 Git 저장소에서 최근 N개 커밋 로그를 가져온다.
 * @param limit 가져올 커밋 개수 (기본값: 20)
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
