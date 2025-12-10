import type { CommitItem, LocalCommitLog } from "../../models/Commit.js";
import type { FileModel } from "../../models/File.js";
import type { CommitDiff } from "../../models/Diff.js";
import type { RefinedData, RefinedItem } from "../../models/refinedData.js";
import type { PipelineOutput } from "../../models/PipelineOutput.js";

/**
 * 수집된 Raw Data(PipelineOutput)를 NLP 모델이 이해하기 쉬운 텍스트 포맷으로 변환(정제)합니다.
 * 커밋 메시지, 파일 변경 내역, Diff 내용을 합쳐 하나의 문맥(Text Chunk)으로 만듭니다.
 * 
 * @param {PipelineOutput} data - 파이프라인에서 수집된 원본 데이터
 * @returns {RefinedData} 정제된 데이터 객체
 */
export function refineData(data: PipelineOutput): RefinedData {
    const items: RefinedItem[] = [];

    // diff lookup map for efficiency
    const diffMap = new Map<string, CommitDiff>();
    data.commitDiffs.forEach(d => diffMap.set(d.sha, d));

    for (const commit of data.commits) {
        const sha = commit.sha;
        const fileModels = data.commitFiles[sha] || [];
        const commitDiff = diffMap.get(sha);

        // Construct the text content
        const lines: string[] = [];

        lines.push(`Commit: ${sha}`);
        lines.push(`Author: ${commit.author || "Unknown"}`);
        lines.push(`Date: ${commit.date}`);
        lines.push(`Message: ${commit.message}`);
        lines.push("");

        lines.push("Affected Files:");
        if (fileModels.length > 0) {
            for (const file of fileModels) {
                lines.push(`- ${file.filename} (${file.status}) +${file.additions} -${file.deletions}`);
            }
        } else {
            lines.push("(No file changes detected or fetched)");
        }
        lines.push("");

        lines.push("Diff Summary:");
        if (commitDiff && commitDiff.files.length > 0) {
            for (const fileDiff of commitDiff.files) {
                lines.push(`File: ${fileDiff.filePath}`);
                // Limit patch size to avoid extremely large chunks? 
                // For now, we take 100 lines max per file to be safe, or just include all.
                // Let's truncate if > 2000 chars for safety in this MVP.
                let patch = fileDiff.patch || "";
                if (patch.length > 2000) {
                    patch = patch.slice(0, 2000) + "\n...(Truncated)...";
                }
                lines.push(patch);
                lines.push("---");
            }
        } else {
            // Fallback to GitHub API patch if local diff is missing?
            // Usually local diff is better. If missing, maybe just say so.
            // But let's check fileModels for patches if we really want fallback.
            // For now, simple textual indication.
            lines.push("(No diff details available)");
        }

        const content = lines.join("\n");

        items.push({
            id: sha,
            type: "commit",
            content: content,
            metadata: {
                sha: sha,
                author: commit.author || "Unknown",
                date: commit.date,
                message: commit.message,
                fileCount: fileModels.length
            }
        });
    }

    return { items };
}
