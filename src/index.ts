import dotenv from "dotenv";
import { fetchAllCommits } from "./github/fetchCommit.js";
import { fetchFiles } from "./github/fetchFiles.js";
import { parseLog } from "./git/parseLog.js";
import { extractDiff } from "./git/extractDiff.js";

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

        // 로컬 커밋 로그 가져오기 및 diff 추출
        console.log("\n📊 Extracting local commit diffs...\n");
        const localCommits = await parseLog(10);
        const diffs = await extractDiff(localCommits);
        console.log('✅ Local diffs extracted:', JSON.stringify(diffs, null, 2));

        // files 모드 로직을 각 커밋 SHA에 대해 실행
        console.log("\n📂 Running files mode for each commit...\n");
        for (let i = 0; i < commits.length; i++) {
            const commit = commits[i];
            if (!commit) continue;

            console.log(`\n[${i + 1}/${commits.length}] Files mode for commit: ${commit.sha.substring(0, 7)}`);

            try {
                const files = await fetchFiles({ owner, repo, sha: commit.sha });
                console.log("📌 FetchFiles 상세 결과:");
                console.log("Commit:", commit.sha);
                console.log("File Count:", files.length);
                console.log(JSON.stringify(files, null, 2));
            } catch (err) {
                console.error(`❌ fetchFiles 실행 실패 for ${commit.sha}`);
                console.error(err);
            }
        }

        console.log("\n✅ All files mode processing completed.");

        return;
    }

    // 특정 커밋 SHA로 파일 가져오기 (commits 모드 이후에도 실행 가능)
    if (mode === "files" || (mode === "commits" && process.argv[3])) {
        const sha = process.argv[3];

        if (!sha) {
            if (mode === "files") {
                console.error("❌ 커밋 SHA를 입력하세요.");
                console.error("예: pnpm ts-node src/index.ts files a1b2c3d4");
                return;
            }
            // commits 모드에서 SHA가 없으면 정상 종료
            if (mode === "commits") {
                return;
            }
        }

        const owner = process.env.GITHUB_OWNER || process.env.TARGET_REPO_OWNER;
        const repo = process.env.GITHUB_REPO || process.env.TARGET_REPO_NAME;

        if (!owner || !repo) {
            console.error("❌ .env 파일에 GITHUB_OWNER, GITHUB_REPO를 설정하세요.");
            return;
        }

        try {
            const files = await fetchFiles({ owner: owner!, repo: repo!, sha: sha! });
            console.log("📌 FetchFiles 상세 결과:");
            console.log("Commit:", sha);
            console.log("File Count:", files.length);
            console.log(JSON.stringify(files, null, 2));
        } catch (err) {
            console.error("❌ fetchFiles 실행 실패");
            console.error(err);
        }

        return;
    }

    console.error("❌ 알 수 없는 모드:", mode);
}

main();
