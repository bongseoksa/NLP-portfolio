import "dotenv/config";
import fetch from "node-fetch";
import type { CommitItem } from "../../../domain/entities/Commit.js";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const OWNER = process.env.TARGET_REPO_OWNER!;
const REPO = process.env.TARGET_REPO_NAME!;

/**
 * GitHub API 요청
 */
async function githubRequest(url: string) {
    const res = await fetch(url, {
        headers: {
            "User-Agent": "portfolio-personal-key",
            "Accept": "application/vnd.github+json",
            "Authorization": `Bearer ${GITHUB_TOKEN}`,
        },
    });

    if (!res.ok) {
        throw new Error(`GitHub API Error: ${res.status} ${res.statusText}`);
    }

    return res.json();
}

/**
 * GitHub Repository의 전체 커밋 목록을 페이지네이션(Pagination)하여 모두 가져옵니다.
 * 
 * @returns {Promise<CommitItem[]>} 전체 커밋 리스트
 */
export async function fetchAllCommits(): Promise<CommitItem[]> {
    let page = 1;
    const perPage = 100;

    const commits: CommitItem[] = [];

    while (true) {
        const url = `https://api.github.com/repos/${OWNER}/${REPO}/commits?per_page=${perPage}&page=${page}`;

        console.log(`📡 Fetching commits page ${page}...`);

        const data = await githubRequest(url);

        if (!Array.isArray(data) || data.length === 0) {
            console.log("✔ All commits fetched.");
            break;
        }

        // 필요한 필드만 추출
        const mapped = data.map((item: any) => ({
            sha: item.sha,
            author: item.commit?.author?.name ?? null,
            date: item.commit?.author?.date ?? "",
            message: item.commit?.message ?? "",
            url: item.html_url ?? "",
        })) as CommitItem[];

        commits.push(...mapped);

        page++;
    }

    return commits;
}

// 테스트 실행용 (node src/api/fetchCommits.ts)
// if (require.main === module) {
//     fetchAllCommits()
//         .then(commits => {
//             console.log(`\n📌 Total fetched commits: ${commits.length}`);
//             console.log("📝 Sample:", commits[0]);
//         })
//         .catch(err => console.error("❌ Error:", err));
// }
