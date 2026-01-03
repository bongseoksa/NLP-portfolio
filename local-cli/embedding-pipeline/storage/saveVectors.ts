/**
 * ChromaDB와 상호작용하여 벡터 데이터를 저장하고 검색하는 모듈입니다.
 */
import { ChromaClient, type Collection } from "chromadb";
import type { RefinedItem } from "../../shared/models/refinedData.js";

// ChromaDB 클라이언트 초기화 (기본 localhost:8000)
const client = new ChromaClient();

/**
 * 기존 컬렉션을 삭제합니다.
 * 
 * @param {string} collectionName - 삭제할 컬렉션 이름
 */
export async function deleteCollection(collectionName: string): Promise<boolean> {
    try {
        await client.deleteCollection({ name: collectionName });
        console.log(`🗑️ Collection '${collectionName}' deleted.`);
        return true;
    } catch (error: any) {
        // 컬렉션이 존재하지 않는 경우 무시
        if (error.message?.includes("does not exist")) {
            console.log(`ℹ️ Collection '${collectionName}' does not exist, skipping delete.`);
            return false;
        }
        throw error;
    }
}

/**
 * 정제된 데이터를 벡터 저장소(Chroma)에 저장합니다.
 * 컬렉션이 없으면 생성합니다.
 * 
 * @param {string} collectionName - 저장할 컬렉션 이름
 * @param {RefinedItem[]} items - 저장할 데이터 아이템 목록
 * @param {number[][]} embeddings - 각 아이템에 대응하는 임베딩 벡터 목록
 * @param {boolean} reset - true이면 기존 컬렉션을 삭제하고 새로 생성
 */
export async function saveVectors(
    collectionName: string,
    items: RefinedItem[],
    embeddings: number[][],
    reset: boolean = false
): Promise<void> {
    try {
        // 리셋 옵션이 있으면 기존 컬렉션 삭제
        if (reset) {
            console.log(`🔄 Reset mode: Deleting existing collection '${collectionName}'...`);
            await deleteCollection(collectionName);
        }

        // 컬렉션 가져오기 또는 생성
        const collection = await client.getOrCreateCollection({
            name: collectionName,
        });

        const ids = items.map(item => item.id);
        const documents = items.map(item => item.content);

        // Metadata 처리가 까다로울 수 있음 (nested object 지원 여부 확인 필요)
        // Chroma는 flat metadata를 선호하므로, metadata를 flat하게 변환하거나 
        // 필요한 필드만 string/number/boolean으로 변환해야 함.
        const metadatas = items.map(item => {
            const baseMetadata: any = {
                type: item.type,
            };

            // 커밋 메타데이터
            if (item.type === 'commit') {
                baseMetadata.sha = item.metadata.sha || '';
                baseMetadata.author = item.metadata.author || '';
                baseMetadata.date = item.metadata.date || '';
                baseMetadata.message = item.metadata.message || '';
                baseMetadata.fileCount = item.metadata.fileCount || 0;
                baseMetadata.additions = item.metadata.additions || 0;
                baseMetadata.deletions = item.metadata.deletions || 0;
                if (item.metadata.affectedFiles && item.metadata.affectedFiles.length > 0) {
                    // ChromaDB는 배열을 지원하지 않으므로 JSON 문자열로 저장
                    baseMetadata.affectedFiles = JSON.stringify(item.metadata.affectedFiles);
                }
            }

            // Diff 메타데이터
            if (item.type === 'diff') {
                baseMetadata.commitId = item.metadata.commitId || '';
                baseMetadata.filePath = item.metadata.filePath || '';
                baseMetadata.diffType = item.metadata.diffType || 'modify';
                baseMetadata.fileAdditions = item.metadata.fileAdditions || 0;
                baseMetadata.fileDeletions = item.metadata.fileDeletions || 0;
                baseMetadata.changeCategory = item.metadata.changeCategory || 'chore';
                if (item.metadata.semanticHint && item.metadata.semanticHint.length > 0) {
                    baseMetadata.semanticHint = JSON.stringify(item.metadata.semanticHint);
                }
            }

            // 파일 메타데이터
            if (item.type === 'file') {
                baseMetadata.path = item.metadata.path || '';
                baseMetadata.fileType = item.metadata.fileType || '';
                baseMetadata.size = item.metadata.size || 0;
                baseMetadata.extension = item.metadata.extension || '';
                baseMetadata.sha = item.metadata.sha || ''; // 파일의 최신 커밋 SHA
                if (item.metadata.chunkIndex !== undefined) {
                    baseMetadata.chunkIndex = item.metadata.chunkIndex;
                }
                if (item.metadata.totalChunks !== undefined) {
                    baseMetadata.totalChunks = item.metadata.totalChunks;
                }
            }

            return baseMetadata;
        });

        console.log(`📌 Upserting ${ids.length} items to Chroma collection '${collectionName}'...`);

        await collection.upsert({
            ids: ids,
            embeddings: embeddings,
            metadatas: metadatas,
            documents: documents,
        });

        console.log("✔ Vector storage save completed.");
    } catch (error) {
        console.error("❌ ChromaDB Save Error:", error);
        throw error;
    }
}
