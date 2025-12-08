import fs from "fs";
import path from "path";
import { fetchAllCommits, type CommitItem } from "../github/fetchCommit.js";
import { fetchFiles } from "../github/fetchFiles.js";
import { parseLog, type LocalCommitLog } from "../git/parseLog.js";
import { extractDiff, type CommitDiff } from "../git/extractDiff.js";
import type { FileModel } from "../models/fileModel.js";

export async function runPipeline() {
    console.log("🚀 Pipeline started\n");

    const owner = process.env.TARGET_REPO_OWNER!;
    const repo = process.env.TARGET_REPO_NAME!;
    const localRepo = process.env.LOCAL_REPO_PATH!;

    if (!owner || !repo) {
        console.error("❌ TARGET_REPO_OWNER / TARGET_REPO_NAME 환경 변수가 필요합니다.");
        return;
    }

    if (!localRepo) {
        console.error("❌ LOCAL_REPO_PATH 환경 변수가 필요합니다.");
        return;
    }

    const result: {
        commits: CommitItem[];
        commitFiles: Record<string, FileModel[]>;
        commitDiffs: CommitDiff[];
        localLogs: LocalCommitLog[];
    } = {
        commits: [],
        commitFiles: {},
        commitDiffs: [],
        localLogs: []
    };

    // 1️⃣ GitHub 커밋 전체 가져오기
    console.log("📌 Fetching commit list from GitHub...");
    const commits = await fetchAllCommits();
    result.commits = commits;
    console.log(`   → ${commits.length} commits fetched.`);

    // 2️⃣ 각 커밋 SHA에 대한 변경 파일 가져오기
    console.log("\n📌 Fetching changed files for each commit...");
    for (const commit of commits) {
        const sha = commit.sha;

        const files = await fetchFiles({ owner, repo, sha });
        result.commitFiles[sha] = files;
    }
    console.log("   → commitFiles completed.");

    // 3️⃣ 로컬 repo에서 커밋 diff 가져오기
    console.log("\n📌 Extracting local diffs...");
    const localCommits = await parseLog(commits.length);
    const diffs = await extractDiff(localCommits);
    result.commitDiffs = diffs;
    console.log("   → commitDiffs completed.");

    // 4️⃣ 로컬 git 로그 저장 (이미 위에서 가져옴)
    console.log("\n📌 Saving local git logs...");
    result.localLogs = localCommits;
    console.log(`   → ${localCommits.length} logs saved.`);


    // 5️⃣ JSON 파일로 저장
    const outputDir = path.join(process.cwd(), "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    fs.writeFileSync(
        path.join(outputDir, "pipeline_output.json"),
        JSON.stringify(result, null, 2),
        "utf-8"
    );

    console.log("\n🎉 Pipeline finished!");
    console.log("📁 Saved → output/pipeline_output.json");
}

// 스크립트 직접 실행 시 파이프라인 실행
runPipeline().catch(err => {
    console.error("❌ Pipeline failed:", err);
    process.exit(1);
});

