import dotenv from "dotenv";
dotenv.config();

import { runPipeline } from "./pipeline/runPipeline.js";
import { searchVectors } from "./vector_store/searchVectors.js";
import { generateAnswer } from "./qa/answer.js";

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
    console.log(`
🚀 NLP Portfolio - GitHub Repository Analyzer

Usage:
  pnpm run dev [command] [options]

Commands:
  (none)         전체 파이프라인 실행 (데이터 수집 + 임베딩 + 저장)
  ask <질문>     질의응답 모드 (벡터 검색 + LLM 답변 생성)
  reindex        기존 데이터로 재임베딩 (컬렉션 리셋 + 새 임베딩 저장)
  help           도움말 출력

Options:
  --reset        기존 벡터 컬렉션 삭제 후 새로 생성 (임베딩 차원 변경 시 필요)

Examples:
  pnpm run dev                    # 전체 파이프라인 실행
  pnpm run dev --reset            # 컬렉션 리셋 후 전체 파이프라인 실행
  pnpm run dev reindex            # 기존 데이터로 재임베딩 (권장)
  pnpm run ask "기술스택 알려줘"    # 질의응답
`);
}

async function main() {
    console.log("🚀 NLP Portfolio Project Started");
    console.log("GitHub Token Exists:", !!process.env.GITHUB_TOKEN);

    // 옵션 파싱
    const hasReset = args.includes("--reset");
    const filteredArgs = args.filter(arg => !arg.startsWith("--"));
    const cmd = filteredArgs[0];

    if (cmd === "help" || cmd === "--help" || cmd === "-h") {
        printHelp();
        return;
    }

    if (cmd === "ask" || cmd === "query") {
        const query = filteredArgs.slice(1).join(" ");
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

    } else if (cmd === "reindex") {
        // 재임베딩 모드: 기존 데이터를 새 임베딩으로 다시 저장
        console.log("\n🔄 Reindex mode: Re-embedding existing data with current embedding provider...\n");
        await runPipeline({ reset: true, skipFetch: true });

    } else {
        // 기본 모드: 파이프라인 실행
        await runPipeline({ reset: hasReset });
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
