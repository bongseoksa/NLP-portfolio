import fs from "fs";
import path from "path";
import { fetchAllCommits } from "../data_sources/github/fetchCommit.js";
import { fetchFiles } from "../data_sources/github/fetchFiles.js";
import { fetchRepositoryFiles } from "../data_sources/github/fetchRepositoryFiles.js";
import type { PipelineOutput } from "../../shared/models/PipelineOutput.js";
import { refineData } from "./steps/preprocessText.js";
import { generateEmbeddings } from "../nlp/embedding/openaiEmbedding.js";
import { saveVectors } from "../storage/saveVectors.js";
import { saveVectorsSupabase } from "../storage/saveVectorsSupabase.js";
import type { EmbeddingItem } from "../../shared/models/EmbeddingItem.js";

export interface PipelineOptions {
    /** 기존 벡터 컬렉션을 삭제하고 새로 생성 (임베딩 차원 변경 시 필요) */
    reset?: boolean;
    /** 특정 레포지토리 지정 (owner/repo 형식) */
    targetRepo?: { owner: string; repo: string };
    /** Supabase Vector Store 사용 (환경 변수로도 제어 가능) */
    useSupabase?: boolean;
}

/**
 * 전체 데이터 수집 및 전처리 파이프라인을 실행합니다.
 * 1. GitHub API 커밋 수집
 * 2. 변경 파일 정보 수집 (GitHub API - patch 포함)
 * 3. 레포지토리 소스 코드 수집
 * 4. 데이터 정제 (NLP 입력 형태)
 * 5. 임베딩 생성 (OpenAI → Chroma 기본 임베딩 fallback)
 * 6. 벡터 저장 (Chroma)
 */
export async function runPipeline(options: PipelineOptions = {}) {
    const { reset = false, targetRepo, useSupabase: optionUseSupabase } = options;

    // Supabase 사용 여부 결정: 옵션 > 환경 변수
    const useSupabase = optionUseSupabase ?? (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) ? true : false;

    console.log("🚀 Pipeline started\n");
    console.log(`📊 Vector Store: ${useSupabase ? "Supabase (Cloud)" : "ChromaDB (Local)"}`);

    if (reset) {
        console.log("🔄 Reset mode enabled: Vector collection will be recreated.\n");
    }

    // targetRepo 옵션 필수 (target-repos.json은 runPollingPipeline에서 처리)
    if (!targetRepo) {
        console.error("❌ targetRepo 옵션이 필요합니다. runPollingPipeline을 사용하거나 targetRepo 옵션을 제공해주세요.");
        return;
    }

    const { owner, repo } = targetRepo;

    console.log(`📦 Target repository: ${owner}/${repo}`);

    const outputDir = path.join(process.cwd(), "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    // 전체 파이프라인 실행 (이전 임베딩 파일 조회 로직 제거)
    const result: PipelineOutput = {
        commits: [],
        commitFiles: {},
        repositoryFiles: []
    };

        // 1️⃣ GitHub 커밋 전체 가져오기
        console.log("📌 Fetching commit list from GitHub...");
        const commits = await fetchAllCommits(owner, repo);
        result.commits = commits;
        console.log(`   → ${commits.length} commits fetched.`);

        // 2️⃣ 각 커밋 SHA에 대한 변경 파일 가져오기 (GitHub API - patch 포함)
        console.log("\n📌 Fetching changed files for each commit (with patch)...");
        for (const commit of commits) {
            const sha = commit.sha;
            const files = await fetchFiles({ owner, repo, sha });
            result.commitFiles[sha] = files;
        }
        console.log("   → commitFiles completed.");

        // 3️⃣ 레포지토리 모든 파일 내용 가져오기 (소스 코드 레벨 질문용)
        console.log("\n📌 Fetching repository files (source code)...");
        try {
            // 기본 브랜치 자동 감지 (null 전달 시 자동으로 기본 브랜치 사용)
            const repositoryFiles = await fetchRepositoryFiles(owner, repo, null, {
                maxFileSize: 500000, // 500KB
                excludeExtensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf'],
                excludePaths: ['node_modules', '.git', 'dist', 'build', '.next', '.venv', '__pycache__', '.chroma_venv'],
                concurrency: 5, // 동시 요청 수
            });
            result.repositoryFiles = repositoryFiles;
            console.log(`   → ${repositoryFiles.length} files fetched.`);
        } catch (error: any) {
            console.error("❌ Repository files fetch failed:", error.message);
            console.warn("   → Continuing without repository files...");
            result.repositoryFiles = [];
        }

        // 4️⃣ JSON 파일로 저장 (Raw)
        fs.writeFileSync(
            path.join(outputDir, "pipeline_output.json"),
            JSON.stringify(result, null, 2),
            "utf-8"
        );

        // 5️⃣ 데이터 정제
        console.log("\n📌 Data Refinement (NLP Preparation)...");
        const refinedData = refineData(result);
        console.log(`   → ${refinedData.items.length} items refined.`);

        // 6️⃣ 임베딩 생성 및 저장 (OpenAI 또는 Chroma 기본 임베딩 fallback)
        console.log("\n📌 Generating Embeddings...");
        try {
            const batchSize = 10;
            const items = refinedData.items;
        const embeddings: number[][] = [];

        // Batch processing to avoid huge payload
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            // Use embeddingText (자연어 변환) instead of content (raw data)
            const texts = batch.map((item: any) => item.embeddingText);
            console.log(`   Processing batch ${i / batchSize + 1}/${Math.ceil(items.length / batchSize)}...`);

            const batchEmbeddings = await generateEmbeddings(texts);
            embeddings.push(...batchEmbeddings);
        }

        console.log(`   → Generated ${embeddings.length} vectors.`);

        // 벡터 저장 (Supabase or ChromaDB)
        if (useSupabase) {
            console.log("\n📌 Saving to Supabase Vector Store...");

            // EmbeddingItem 형식으로 변환
            const embeddingItems: EmbeddingItem[] = items.map((item: any, idx: number) => ({
                id: item.id,
                content: item.content,
                embedding: embeddings[idx] || [],
                metadata: {
                    ...item.metadata,
                    owner,
                    repo
                }
            }));

            await saveVectorsSupabase(embeddingItems, { reset, owner, repo });
        } else {
            console.log("\n📌 Saving to ChromaDB...");
            // Collection name: 모든 타입(commit, diff, file)을 하나의 컬렉션에 저장
            // 메타데이터의 type 필드로 구분됨
            await saveVectors(`${repo}-vectors`, items, embeddings, reset);
        }

    } catch (err: any) {
        console.error("❌ Embedding/Vector Store Failed:", err.message);
        if (!useSupabase) {
            console.error("   (Is ChromaDB running? 'pnpm run chroma:start')");
        }
    }

    console.log("\n🎉 Pipeline finished!");
    console.log("📁 Saved → output/pipeline_output.json");
}

// 스크립트 직접 실행 시 파이프라인 실행
// ESM pattern to check if file is run directly
import { fileURLToPath } from "url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runPipeline().catch(err => {
        console.error("❌ Pipeline failed:", err);
        process.exit(1);
    });
}
