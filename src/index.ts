import dotenv from "dotenv";
dotenv.config();

import { runPipeline } from "./embedding-pipeline/pipelines/runPipeline.js";
import { runPollingPipeline } from "./embedding-pipeline/pipelines/runPollingPipeline.js";
import { searchVectors } from "./service/vector-store/searchVectors.js";
import { searchVectorsSupabase } from "./service/vector-store/searchVectorsSupabase.js";
import { generateAnswer } from "./service/qa/answer.js";
import fs from "fs";

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
    console.log(`
🚀 NLP Portfolio - GitHub Repository Analyzer

Usage:
  pnpm run dev [command] [options]

Commands:
  (none)         폴링 기반 임베딩 파이프라인 (target-repos.json 기반)
  ask <질문>     질의응답 모드 (벡터 검색 + LLM 답변 생성)
  reindex        기존 데이터로 재임베딩 (컬렉션 리셋 + 새 임베딩 저장)
  help           도움말 출력

Options:
  --reset        모든 commit 상태 초기화 + 강제 재임베딩

Pipeline Modes:
  1. Polling Mode (기본) - target-repos.json 기반 자동 변경 감지
     - 각 레포지토리의 최신 commit 조회
     - 이미 처리한 commit은 자동 skip (idempotent)
     - 새로운 commit만 임베딩 수행
     - commit-state.json에 처리 기록 저장

  2. Reset Mode (--reset) - 전체 강제 재임베딩
     - commit 상태를 무시하고 모든 레포지토리 재처리
     - ChromaDB collection 재생성

Examples:
  pnpm run dev                    # 폴링 모드 (변경 감지)
  pnpm run dev --reset            # 전체 재임베딩
  pnpm run dev reindex            # 기존 데이터로 재임베딩
  pnpm run ask "기술스택 알려줘"    # 질의응답

⚠️  zsh 사용 시 주의:
  - 물음표(?), 별표(*) 등 특수문자가 포함된 질문은 반드시 따옴표로 감싸주세요.
  - 예: pnpm run ask "차트는 뭐로 만들어졌어?" (O)
  - 예: pnpm run ask 차트는 뭐로 만들어졌어? (X - zsh glob 오류)

📄 Configuration Files:
  - target-repos.json: 임베딩 대상 레포지토리 목록
  - commit-state.json: 레포지토리별 마지막 처리 commit 기록 (자동 생성)
`);
}

async function main() {
    console.log("🚀 NLP Portfolio Project Started");
    console.log("GitHub Token Exists:", !!process.env.GITHUB_TOKEN);

    // 옵션 파싱
    const hasReset = args.includes("--reset");
    const filteredArgs = args.filter(arg => !arg.startsWith("--"));
    const cmd = filteredArgs[0];

    // zsh glob 패턴 해석 문제 해결: 환경 변수에서 질문 읽기 (fallback)
    // pnpm이 인자를 전달하지 못한 경우를 대비

    if (cmd === "help" || cmd === "--help" || cmd === "-h") {
        printHelp();
        return;
    }

    if (cmd === "ask" || cmd === "query") {
        const query = filteredArgs.slice(1).join(" ");
        if (!query) {
            console.error("❌ 질문을 입력해주세요.");
            console.error("");
            console.error("사용법:");
            console.error('  pnpm run ask "질문 내용"');
            console.error('  pnpm run ask \'차트는 뭐로 만들어졌어?\'');
            console.error("");
            console.error("⚠️  zsh 사용 시: 물음표(?) 등 특수문자가 포함된 질문은 반드시 따옴표로 감싸주세요.");
            return;
        }

        // Supabase 사용 여부 결정
        const useSupabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) ? true : false;

        console.log(`📊 Vector Store: ${useSupabase ? "Supabase (Cloud)" : "ChromaDB (Local)"}`);
        console.log(`❓ Question: ${query}\n`);

        console.log("... 검색 중 (Retrieving contexts) ...");

        let context;
        if (useSupabase) {
            const owner = process.env.TARGET_REPO_OWNER || '';
            const repo = process.env.TARGET_REPO_NAME || 'portfolio';

            context = await searchVectorsSupabase(query, 5, {
                threshold: 0.0,
                filterMetadata: { owner, repo }
            });
        } else {
            const repoName = process.env.TARGET_REPO_NAME || "portfolio";
            const collectionName = `${repoName}-vectors`;

            console.log(`🔍 Searching in collection: ${collectionName}`);
            context = await searchVectors(collectionName, query, 5);
        }

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
        // 기본 모드: 폴링 기반 파이프라인 실행
        // target-repos.json이 존재하면 폴링 모드, 없으면 레거시 모드
        const targetReposPath = "target-repos.json";

        if (fs.existsSync(targetReposPath)) {
            // 폴링 모드: 다중 레포지토리 자동 변경 감지
            console.log("\n📡 Polling mode: Using target-repos.json\n");
            await runPollingPipeline({ reset: hasReset });
        } else {
            // 레거시 모드: 환경 변수 기반 단일 레포지토리
            console.log("\n⚠️  target-repos.json not found, using legacy mode (환경 변수)\n");
            await runPipeline({ reset: hasReset });
        }
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
