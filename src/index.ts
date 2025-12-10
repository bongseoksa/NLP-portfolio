import dotenv from "dotenv";
dotenv.config();

import { runPipeline } from "./pipeline/runPipeline.js";
import { searchVectors } from "./vector_store/searchVectors.js";
import { generateAnswer } from "./qa/answer.js";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    console.log("🚀 NLP Portfolio Project Started");
    console.log("GitHub Token Exists:", !!process.env.GITHUB_TOKEN);

    if (command === "ask" || command === "query") {
        const query = args.slice(1).join(" ");
        if (!query) {
            console.error("❌ 질문을 입력해주세요. (예: ask '이 프로젝트의 목적은?')");
            return;
        }

        const repoName = process.env.TARGET_REPO_NAME || "portfolio";
        const collectionName = `${repoName}-commits`;

        console.log(`🔍 Searching in collection: ${collectionName}`);
        console.log(`❓ Question: ${query}\n`);

        console.log("... 검색 중 (Retrieving contexts) ...");
        const context = await searchVectors(collectionName, query, 5);

        console.log(`   → Found ${context.length} relevant documents.\n`);

        console.log("... 답변 생성 중 (Generating answer) ...");
        const answer = await generateAnswer(query, context);

        console.log("\n🤖 Answer:");
        console.log("---------------------------------------------------");
        console.log(answer);
        console.log("---------------------------------------------------");

    } else {
        // 기본 모드: 파이프라인 실행
        await runPipeline();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});