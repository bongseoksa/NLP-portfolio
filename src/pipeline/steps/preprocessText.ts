import type { CommitItem, LocalCommitLog } from "../../models/Commit.js";
import type { FileModel } from "../../models/File.js";
import type { CommitDiff } from "../../models/Diff.js";
import type { RefinedData, RefinedItem } from "../../models/refinedData.js";
import type { PipelineOutput } from "../../models/PipelineOutput.js";

/**
 * 수집된 Raw Data(PipelineOutput)를 NLP 모델이 이해하기 쉬운 텍스트 포맷으로 변환(정제)합니다.
 * 커밋 메시지, 파일 변경 내역, Diff 내용, 레포지토리 파일 내용을 합쳐 하나의 문맥(Text Chunk)으로 만듭니다.
 * 
 * @param {PipelineOutput} data - 파이프라인에서 수집된 원본 데이터
 * @returns {RefinedData} 정제된 데이터 객체
 */
export function refineData(data: PipelineOutput): RefinedData {
    const items: RefinedItem[] = [];

    // diff lookup map for efficiency
    const diffMap = new Map<string, CommitDiff>();
    data.commitDiffs.forEach(d => diffMap.set(d.sha, d));

    // 1. 커밋 데이터 정제
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
                // Limit patch size to avoid extremely large chunks
                let patch = fileDiff.patch || "";
                if (patch.length > 2000) {
                    patch = patch.slice(0, 2000) + "\n...(Truncated)...";
                }
                lines.push(patch);
                lines.push("---");
            }
        } else {
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

    // 2. 레포지토리 파일 데이터 정제 (소스 코드 레벨 질문용)
    if (data.repositoryFiles && data.repositoryFiles.length > 0) {
        console.log(`📝 ${data.repositoryFiles.length}개 파일을 정제 중...`);
        
        for (const file of data.repositoryFiles) {
            // 파일 내용이 너무 긴 경우 청크로 분할
            const maxChunkSize = 5000; // 5KB per chunk
            const chunks = splitFileIntoChunks(file.content, maxChunkSize);

            chunks.forEach((chunk, index) => {
                const lines: string[] = [];
                lines.push(`File: ${file.path}`);
                lines.push(`Type: ${file.type}`);
                lines.push(`Size: ${file.size} bytes`);
                lines.push(`Extension: ${file.extension}`);
                lines.push("");

                if (chunks.length > 1) {
                    lines.push(`[Chunk ${index + 1}/${chunks.length}]`);
                    lines.push("");
                }

                lines.push("Content:");
                lines.push(chunk);

                const content = lines.join("\n");

                items.push({
                    id: `file-${file.path}-${index}`,
                    type: "file",
                    content: content,
                    metadata: {
                        path: file.path,
                        type: file.type,
                        size: file.size,
                        extension: file.extension,
                        sha: file.sha,
                        chunkIndex: chunks.length > 1 ? index : undefined,
                        totalChunks: chunks.length > 1 ? chunks.length : undefined,
                    }
                });
            });
        }

        console.log(`   → ${items.filter(item => item.type === 'file').length}개 파일 청크 생성됨`);
    }

    return { items };
}

/**
 * 파일 내용을 지정된 크기로 청크로 분할합니다.
 * 줄 단위로 분할하여 문맥을 유지합니다.
 */
function splitFileIntoChunks(content: string, maxChunkSize: number): string[] {
    if (content.length <= maxChunkSize) {
        return [content];
    }

    const chunks: string[] = [];
    const lines = content.split('\n');
    let currentChunk: string[] = [];
    let currentSize = 0;

    for (const line of lines) {
        const lineSize = line.length + 1; // +1 for newline

        if (currentSize + lineSize > maxChunkSize && currentChunk.length > 0) {
            // 현재 청크 저장
            chunks.push(currentChunk.join('\n'));
            currentChunk = [line];
            currentSize = lineSize;
        } else {
            currentChunk.push(line);
            currentSize += lineSize;
        }
    }

    // 마지막 청크 추가
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
    }

    return chunks;
}
