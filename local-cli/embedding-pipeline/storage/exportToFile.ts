/**
 * 임베딩을 정적 파일로 내보내기 (Serverless 배포용)
 *
 * ChromaDB/Supabase에 저장된 임베딩을 JSON 파일로 내보내
 * CDN/Blob Storage에 업로드하여 서버 비용 0원 달성
 */

import fs from "fs";
import path from "path";
import { promisify } from "util";
import { gzip } from "zlib";
import type { EmbeddingItem } from "../../shared/models/EmbeddingItem.js";

const gzipAsync = promisify(gzip);

export interface ExportOptions {
    /** 출력 파일 경로 (기본: output/embeddings.json) */
    outputPath?: string;
    /** gzip 압축 여부 (기본: true) */
    compress?: boolean;
    /** Vercel Blob 업로드 여부 */
    uploadToVercelBlob?: boolean;
    /** S3 업로드 설정 */
    uploadToS3?: {
        bucket: string;
        region?: string;
        key?: string;
    };
}

interface VectorFile {
    version: string;
    dimension: number;
    count: number;
    createdAt: string;
    metadata: {
        owner: string;
        repo: string;
    };
    vectors: Array<{
        id: string;
        embedding: number[];
        content: string;
        metadata: Record<string, any>;
    }>;
}

/**
 * 임베딩을 파일로 내보내기
 */
export async function exportEmbeddingsToFile(
    items: EmbeddingItem[],
    options: ExportOptions = {}
): Promise<string> {
    const {
        outputPath = "output/embeddings.json",
        compress = true,
        uploadToVercelBlob = false,
        uploadToS3
    } = options;

    console.log(`\n📦 Exporting ${items.length} embeddings to file...`);

    // 1. 출력 디렉토리 생성
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 2. JSON 구조 생성
    const vectorFile: VectorFile = {
        version: "1.0",
        dimension: items[0]?.embedding.length || 1536,
        count: items.length,
        createdAt: new Date().toISOString(),
        metadata: {
            owner: process.env.TARGET_REPO_OWNER || "",
            repo: process.env.TARGET_REPO_NAME || ""
        },
        vectors: items.map(item => ({
            id: item.id,
            embedding: item.embedding,
            content: item.content,
            metadata: item.metadata
        }))
    };

    // 3. JSON 직렬화
    const jsonString = JSON.stringify(vectorFile);
    const jsonSize = Buffer.byteLength(jsonString, 'utf-8');
    console.log(`   → JSON size: ${(jsonSize / 1024 / 1024).toFixed(2)} MB`);

    // 4. 압축 (선택)
    let finalBuffer: Buffer;
    let finalPath = outputPath;

    if (compress) {
        console.log("   → Compressing with gzip...");
        finalBuffer = await gzipAsync(jsonString);
        finalPath = `${outputPath}.gz`;
        const compressedSize = finalBuffer.length;
        const ratio = ((1 - compressedSize / jsonSize) * 100).toFixed(1);
        console.log(`   → Compressed: ${(compressedSize / 1024 / 1024).toFixed(2)} MB (-${ratio}%)`);
    } else {
        finalBuffer = Buffer.from(jsonString, 'utf-8');
    }

    // 5. 로컬 파일 저장
    fs.writeFileSync(finalPath, finalBuffer);
    console.log(`✅ Saved to: ${finalPath}`);

    // 6. 클라우드 업로드 (선택)
    if (uploadToVercelBlob) {
        await uploadToVercel(finalBuffer, finalPath);
    }

    if (uploadToS3) {
        await uploadToAWSS3(finalBuffer, uploadToS3);
    }

    return finalPath;
}

/**
 * Vercel Blob Storage에 업로드
 */
async function uploadToVercel(buffer: Buffer, filePath: string): Promise<void> {
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    if (!token) {
        console.warn("⚠️  BLOB_READ_WRITE_TOKEN not set, skipping Vercel Blob upload");
        return;
    }

    try {
        console.log("   → Uploading to Vercel Blob...");

        const { put } = await import("@vercel/blob");

        const blob = await put(path.basename(filePath), buffer, {
            access: 'public',
            token,
            addRandomSuffix: false
        });

        console.log(`✅ Uploaded to Vercel Blob: ${blob.url}`);
        console.log(`   → Set VECTOR_FILE_URL=${blob.url} in production`);

    } catch (error: any) {
        console.error("❌ Vercel Blob upload failed:", error.message);
        throw error;
    }
}

/**
 * AWS S3에 업로드
 */
async function uploadToAWSS3(
    buffer: Buffer,
    config: { bucket: string; region?: string; key?: string }
): Promise<void> {
    const { bucket, region = "us-east-1", key = "embeddings.json.gz" } = config;

    try {
        console.log(`   → Uploading to S3: s3://${bucket}/${key}...`);

        const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

        const client = new S3Client({ region });

        await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: key.endsWith('.gz') ? 'application/gzip' : 'application/json',
            ContentEncoding: key.endsWith('.gz') ? 'gzip' : undefined,
            CacheControl: 'public, max-age=3600',  // 1시간 CDN 캐싱
            Metadata: {
                'generated-at': new Date().toISOString()
            }
        }));

        const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
        console.log(`✅ Uploaded to S3: ${url}`);
        console.log(`   → Set VECTOR_FILE_URL=${url} in production`);

    } catch (error: any) {
        console.error("❌ S3 upload failed:", error.message);
        throw error;
    }
}

/**
 * Supabase에서 임베딩 읽어서 파일로 내보내기
 */
export async function exportFromSupabase(options: ExportOptions = {}): Promise<string> {
    console.log("📥 Fetching embeddings from Supabase...");

    const { SupabaseVectorStore } = await import("./supabaseVectorStore.js");
    const vectorStore = new SupabaseVectorStore();

    const owner = process.env.TARGET_REPO_OWNER || "";
    const repo = process.env.TARGET_REPO_NAME || "";

    // Supabase에서 모든 임베딩 조회
    const allEmbeddings = await vectorStore.getAllEmbeddings({ owner, repo });

    console.log(`   → Found ${allEmbeddings.length} embeddings`);

    // EmbeddingItem 형식으로 변환
    const items: EmbeddingItem[] = allEmbeddings.map(item => ({
        id: item.id,
        content: item.content,
        embedding: item.embedding,
        metadata: item.metadata
    }));

    return exportEmbeddingsToFile(items, options);
}

/**
 * ChromaDB에서 임베딩 읽어서 파일로 내보내기
 */
export async function exportFromChromaDB(
    collectionName: string,
    options: ExportOptions = {}
): Promise<string> {
    console.log(`📥 Fetching embeddings from ChromaDB (collection: ${collectionName})...`);

    const { ChromaClient } = await import("chromadb");
    const client = new ChromaClient();

    try {
        const collection = await client.getCollection({ name: collectionName });

        const result = await collection.get({
            include: ["embeddings", "metadatas", "documents"]
        });

        if (!result.ids || result.ids.length === 0) {
            throw new Error("No embeddings found in collection");
        }

        console.log(`   → Found ${result.ids.length} embeddings`);

        // EmbeddingItem 형식으로 변환
        const items: EmbeddingItem[] = result.ids.map((id, idx) => ({
            id,
            content: result.documents?.[idx] || "",
            embedding: result.embeddings?.[idx] || [],
            metadata: result.metadatas?.[idx] || {}
        }));

        return exportEmbeddingsToFile(items, options);

    } catch (error: any) {
        console.error("❌ ChromaDB export failed:", error.message);
        throw error;
    }
}
