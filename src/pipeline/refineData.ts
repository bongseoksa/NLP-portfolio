import type { CommitItem } from "../github/fetchCommit.js";
import type { FileModel } from "../types/fileModel.js";
import type { CommitDiff } from "../git/extractDiff.js";
import type { LocalCommitLog } from "../git/parseLog.js";
import type { RefinedData, RefinedItem } from "../types/refinedData.js";

type PipelineOutput = {
    commits: CommitItem[];
    commitFiles: Record<string, FileModel[]>;
    commitDiffs: CommitDiff[];
    localLogs: LocalCommitLog[];
};

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
