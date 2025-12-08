import dotenv from "dotenv";
import { fetchAllCommits } from "./github/fetchCommit.js";
import { fetchFiles } from "./github/fetchFiles.js";

dotenv.config();

console.log("NLP Portfolio Project Started");
console.log("GitHub Token Exists:", !!process.env.GITHUB_TOKEN);

async function main() {
    const mode = process.argv[2]; // "commits" 또는 "files"

    if (!mode) {
        console.error("❌ 실행 모드를 입력하세요.");
        console.error("예시:");
        console.error("  pnpm ts-node src/index.ts commits");
        console.error("  pnpm ts-node src/index.ts files <commit_sha>");
        return;
    }

    // 기존 기능: 모든 커밋 가져오기 + 각 커밋의 파일 자동 가져오기
    if (mode === "commits") {
        const owner = process.env.GITHUB_OWNER || process.env.TARGET_REPO_OWNER;
        const repo = process.env.GITHUB_REPO || process.env.TARGET_REPO_NAME;

        if (!owner || !repo) {
            console.error("❌ .env 파일에 GITHUB_OWNER, GITHUB_REPO를 설정하세요.");
            return;
        }

        const commits = await fetchAllCommits();
        console.log(`✅ Fetched commits: ${commits.length}`);
        console.log("\n📂 Fetching files for each commit...\n");

        // 각 커밋에 대해 파일 정보 가져오기
        for (let i = 0; i < commits.length; i++) {
            const commit = commits[i];
            if (!commit) continue; // undefined 체크
            console.log(`[${i + 1}/${commits.length}] Processing commit: ${commit.sha.substring(0, 7)}`);
            console.log(`  Author: ${commit.author}`);
            console.log(`  Date: ${commit.date}`);
            console.log(`  Message: ${commit.message.split('\n')[0]}`); // 첫 줄만 표시

            try {
                const files = await fetchFiles({ owner, repo, sha: commit.sha });
                console.log(`  ✅ Files changed: ${files.length}`);

                if (files.length > 0) {
                    files.forEach(file => {
                        console.log(`    - ${file.filename} (${file.status}) [+${file.additions}/-${file.deletions}]`);
                    });
                }
            } catch (err) {
                console.error(`  ❌ Failed to fetch files for commit ${commit.sha}`);
                console.error(`  Error:`, err);
            }

            console.log(""); // 빈 줄 추가
        }

        console.log("✅ All commits and files processed.");
        return;
    }

    // 새로운 테스트: 특정 커밋 SHA로 파일 가져오기
    if (mode === "files") {
        const sha = process.argv[3];

        if (!sha) {
            console.error("❌ 커밋 SHA를 입력하세요.");
            console.error("예: pnpm ts-node src/index.ts files a1b2c3d4");
            return;
        }

        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPO;

        if (!owner || !repo) {
            console.error("❌ .env 파일에 GITHUB_OWNER, GITHUB_REPO를 설정하세요.");
            return;
        }

        try {
            const files = await fetchFiles({ owner, repo, sha });
            console.log("📌 FetchFiles 결과:");
            console.log("Commit:", sha);
            console.log("File Count:", files.length);
            console.log(files);
        } catch (err) {
            console.error("❌ fetchFiles 실행 실패");
            console.error(err);
        }

        return;
    }

    console.error("❌ 알 수 없는 모드:", mode);
}

main();
