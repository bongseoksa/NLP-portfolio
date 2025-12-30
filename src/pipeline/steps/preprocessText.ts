import type { CommitItem } from "../../models/Commit.js";
import type { FileModel } from "../../models/File.js";
import type { RefinedData, RefinedItem } from "../../models/refinedData.js";
import type { PipelineOutput } from "../../models/PipelineOutput.js";
import {
    generateCommitEmbeddingText,
    generateDiffEmbeddingText,
    generateFileEmbeddingText
} from "../../nlp/embedding/embeddingTextGenerator.js";

/**
 * 수집된 Raw Data(PipelineOutput)를 NLP 모델이 이해하기 쉬운 텍스트 포맷으로 변환(정제)합니다.
 * 커밋 메시지, 파일 변경 내역, Diff 내용, 레포지토리 파일 내용을 합쳐 하나의 문맥(Text Chunk)으로 만듭니다.
 * 
 * @param {PipelineOutput} data - 파이프라인에서 수집된 원본 데이터
 * @returns {RefinedData} 정제된 데이터 객체
 */
export function refineData(data: PipelineOutput): RefinedData {
    const items: RefinedItem[] = [];

    // 1. 커밋 데이터 정제 (Diff 제외, 메타데이터만)
    for (const commit of data.commits) {
        const sha = commit.sha;
        const fileModels = data.commitFiles[sha] || [];

        // Commit Entity: 히스토리 정보만 포함 (Diff 제외)
        const lines: string[] = [];

        lines.push(`Commit: ${sha}`);
        lines.push(`Author: ${commit.author || "Unknown"}`);
        lines.push(`Date: ${commit.date}`);
        lines.push(`Message: ${commit.message}`);
        lines.push("");

        lines.push("Affected Files:");
        const affectedFiles: string[] = [];
        let totalAdditions = 0;
        let totalDeletions = 0;

        if (fileModels.length > 0) {
            for (const file of fileModels) {
                lines.push(`- ${file.filename} (${file.status}) +${file.additions || 0} -${file.deletions || 0}`);
                affectedFiles.push(file.filename);
                totalAdditions += file.additions || 0;
                totalDeletions += file.deletions || 0;
            }
        } else {
            lines.push("(No file changes detected or fetched)");
        }

        const content = lines.join("\n");

        // Commit Entity 생성
        const commitItem: RefinedItem = {
            id: `commit-${sha}`,
            type: "commit",
            content: content,
            embeddingText: "", // 임시로 빈 문자열, 아래에서 생성
            metadata: {
                sha: sha,
                author: commit.author || "Unknown",
                date: commit.date,
                message: commit.message,
                affectedFiles: affectedFiles,
                fileCount: fileModels.length,
                additions: totalAdditions,
                deletions: totalDeletions
            }
        };

        // Embedding text 생성
        commitItem.embeddingText = generateCommitEmbeddingText(commitItem);

        items.push(commitItem);

        // 2. Diff Entity 생성 (각 파일별로 독립적으로) - GitHub API 데이터 사용
        if (fileModels && fileModels.length > 0) {
            for (const file of fileModels) {
                const diffLines: string[] = [];

                diffLines.push(`Diff for File: ${file.filename}`);
                diffLines.push(`Commit: ${sha}`);
                diffLines.push(`Changes: +${file.additions} -${file.deletions}`);
                diffLines.push("");

                // Limit patch size to avoid extremely large chunks
                let patch = file.patch || "";
                if (patch.length > 2000) {
                    patch = patch.slice(0, 2000) + "\n...(Truncated)...";
                }

                diffLines.push("Patch:");
                diffLines.push(patch);

                const diffContent = diffLines.join("\n");

                // Diff 타입 결정
                const diffType = file.status === "added" ? "add" :
                                file.status === "removed" ? "delete" :
                                file.status === "renamed" ? "rename" : "modify";

                // 변경 카테고리 추론 (커밋 메시지 기반)
                const message = commit.message.toLowerCase();
                const changeCategory = message.includes("feat") ? "feat" :
                                      message.includes("fix") ? "fix" :
                                      message.includes("refactor") ? "refactor" :
                                      message.includes("docs") ? "docs" :
                                      message.includes("style") ? "style" :
                                      message.includes("test") ? "test" : "chore";

                // 의미론적 힌트 추출
                const semanticHint: string[] = [];
                if (patch.includes("if (") || patch.includes("if(")) semanticHint.push("조건문 변경");
                if (patch.includes("import ")) semanticHint.push("의존성 변경");
                if (patch.includes("export ")) semanticHint.push("export 변경");
                if (patch.includes("function ") || patch.includes("const ") || patch.includes("let ")) semanticHint.push("함수/변수 정의");
                if (patch.includes("//") || patch.includes("/*")) semanticHint.push("주석 변경");

                const diffItem: RefinedItem = {
                    id: `diff-${sha}-${file.filename.replace(/\//g, '-')}`,
                    type: "diff",
                    content: diffContent,
                    embeddingText: "", // 임시로 빈 문자열, 아래에서 생성
                    metadata: {
                        commitId: sha,
                        filePath: file.filename,
                        diffType: diffType,
                        fileAdditions: file.additions || 0,
                        fileDeletions: file.deletions || 0,
                        changeCategory: changeCategory,
                        ...(semanticHint.length > 0 && { semanticHint })
                    }
                };

                // Embedding text 생성
                diffItem.embeddingText = generateDiffEmbeddingText(diffItem);

                items.push(diffItem);
            }
        }
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

                const fileItem: RefinedItem = {
                    id: `file-${file.path}-${index}`,
                    type: "file",
                    content: content,
                    embeddingText: "", // 임시로 빈 문자열, 아래에서 생성
                    metadata: {
                        path: file.path,
                        fileType: file.type,
                        size: file.size,
                        extension: file.extension,
                        sha: file.sha,
                        ...(chunks.length > 1 && {
                            chunkIndex: index,
                            totalChunks: chunks.length
                        })
                    }
                };

                // Embedding text 생성
                fileItem.embeddingText = generateFileEmbeddingText(fileItem);

                items.push(fileItem);
            });
        }

        console.log(`   → ${items.filter(item => item.type === 'file').length}개 파일 청크 생성됨`);
    }

    // 로그: 생성된 엔티티 통계
    const commitCount = items.filter(item => item.type === 'commit').length;
    const diffCount = items.filter(item => item.type === 'diff').length;
    const fileCount = items.filter(item => item.type === 'file').length;

    console.log(`\n📊 생성된 엔티티:`);
    console.log(`   - Commit: ${commitCount}개 (히스토리)`);
    console.log(`   - Diff: ${diffCount}개 (변경사항)`);
    console.log(`   - File: ${fileCount}개 (소스코드)`);
    console.log(`   - 총합: ${items.length}개`);

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
