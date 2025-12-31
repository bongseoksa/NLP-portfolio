import { RepositoryPoller } from "../services/repositoryPoller.js";
import { runPipeline } from "./runPipeline.js";

export interface PollingPipelineOptions {
    /** 모든 레포지토리 강제 재임베딩 (commit 상태 무시) */
    reset?: boolean;
}

/**
 * 폴링 기반 임베딩 파이프라인
 *
 * 1. target-repos.json에서 대상 레포지토리 목록 로드
 * 2. 각 레포지토리에 대해 GitHub API로 변경 감지
 * 3. 새로운 commit이 있는 레포지토리만 임베딩 수행
 * 4. 처리 완료 후 commit 상태 저장
 *
 * 특징:
 * - Idempotent: 동일 commit 재실행 시 skip
 * - Multi-repo 지원
 * - --reset 옵션으로 강제 재임베딩 가능
 */
export async function runPollingPipeline(options: PollingPipelineOptions = {}) {
    const { reset = false } = options;

    console.log("🔄 Polling-based Embedding Pipeline\n");

    // 1. RepositoryPoller 초기화
    const poller = new RepositoryPoller();

    // --reset 옵션: 모든 commit 상태 초기화
    if (reset) {
        console.log("🔄 Reset mode: Clearing all commit states...\n");
        poller.resetState();
    }

    // 2. 모든 대상 레포지토리 폴링
    let pollingResults;
    try {
        pollingResults = await poller.pollAll();
    } catch (error: any) {
        console.error("❌ Polling failed:", error.message);
        process.exit(1);
    }

    // 3. 처리 필요한 레포지토리 필터링
    const reposToProcess = poller.getRepositoriesToProcess(pollingResults);

    console.log("\n📊 Polling Summary:");
    console.log(`   Total repositories: ${pollingResults.length}`);
    console.log(`   Needs processing: ${reposToProcess.length}`);
    console.log(`   Up to date: ${pollingResults.length - reposToProcess.length}`);

    // 4. 처리 필요한 레포지토리가 없으면 종료
    if (reposToProcess.length === 0) {
        console.log("\n✅ All repositories are up to date. Nothing to process.");
        poller.printState();
        return;
    }

    // 5. 각 레포지토리에 대해 임베딩 파이프라인 실행
    console.log(`\n🚀 Processing ${reposToProcess.length} repositories...\n`);

    let successCount = 0;
    let failureCount = 0;

    for (const result of reposToProcess) {
        console.log(`\n${"=".repeat(80)}`);
        console.log(`Processing: ${result.id}`);
        console.log(`Reason: ${result.reason}`);
        console.log(`${"=".repeat(80)}\n`);

        try {
            // 파이프라인 실행 (특정 레포지토리 대상)
            await runPipeline({
                targetRepo: {
                    owner: result.owner,
                    repo: result.repo
                },
                reset: reset // ChromaDB collection reset 여부
            });

            // 성공 시 commit 상태 업데이트
            poller.markAsProcessed(result);
            successCount++;

            console.log(`\n✅ Successfully processed ${result.id}\n`);

        } catch (error: any) {
            console.error(`\n❌ Failed to process ${result.id}:`, error.message);
            console.error("   Skipping this repository and continuing...\n");
            failureCount++;
            // Continue with next repository
        }
    }

    // 6. 최종 결과 출력
    console.log(`\n${"=".repeat(80)}`);
    console.log("🎉 Polling Pipeline Finished!");
    console.log(`${"=".repeat(80)}`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failure: ${failureCount}`);
    console.log(`   Total: ${reposToProcess.length}`);

    // 현재 commit 상태 출력
    poller.printState();

    // 실패가 있으면 exit code 1
    if (failureCount > 0) {
        process.exit(1);
    }
}
