#!/usr/bin/env tsx
/**
 * 임베딩을 파일로 내보내기 스크립트
 *
 * 사용법:
 *   pnpm tsx scripts/export-embeddings.ts --source supabase --output output/embeddings.json.gz
 */

import dotenv from "dotenv";
import { gzip } from "zlib";
import { promisify } from "util";
import { writeFile } from "fs/promises";
import { getSupabaseServiceClient } from "../shared/lib/supabase.js";
import type { EmbeddingItem } from "../shared/models/EmbeddingItem.js";

dotenv.config();

const gzipAsync = promisify(gzip);

interface Args {
    source: "supabase";
    output?: string;
    compress?: boolean;
}

function parseArgs(): Args {
    const args = process.argv.slice(2);
    const parsed: Partial<Args> = {
        source: "supabase",
        compress: true
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === "--source" && args[i + 1]) {
            parsed.source = args[i + 1] as "supabase";
            i++;
        } else if (arg === "--output" && args[i + 1]) {
            parsed.output = args[i + 1] as string;
            i++;
        } else if (arg === "--no-compress") {
            parsed.compress = false;
        }
    }

    return parsed as Args;
}

interface VectorFile {
    version: string;
    generatedAt: string;
    statistics: {
        totalEmbeddings: number;
        commitCount: number;
        fileCount: number;
        qaCount: number;
    };
    vectors: EmbeddingItem[];
}

async function exportFromSupabase(outputPath?: string, compress: boolean = true): Promise<string> {
    const client = getSupabaseServiceClient();
    if (!client) {
        throw new Error("Supabase Service Role Key가 설정되지 않았습니다.");
    }

    console.log("📥 Supabase에서 임베딩 조회 중...");
    
    // 모든 임베딩 조회
    const { data, error } = await client
        .from('embeddings')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(`Supabase 조회 실패: ${error.message}`);
    }

    if (!data || data.length === 0) {
        throw new Error("임베딩 데이터가 없습니다.");
    }

    console.log(`✅ ${data.length}개 임베딩 조회 완료`);

    // 통계 계산
    const commitCount = data.filter((e: any) => e.type === 'commit').length;
    const fileCount = data.filter((e: any) => e.type === 'file').length;
    const qaCount = data.filter((e: any) => e.type === 'qa').length;

    // EmbeddingItem 형식으로 변환
    const vectors: EmbeddingItem[] = data.map((row: any) => ({
        id: row.id,
        type: row.type as 'commit' | 'file' | 'qa',
        content: row.content,
        embedding: row.embedding,
        metadata: row.metadata,
    }));

    // VectorFile 형식으로 구성
    const vectorFile: VectorFile = {
        version: "1.0",
        generatedAt: new Date().toISOString(),
        statistics: {
            totalEmbeddings: vectors.length,
            commitCount,
            fileCount,
            qaCount,
        },
        vectors,
    };

    // JSON 문자열로 변환
    const jsonString = JSON.stringify(vectorFile, null, 2);
    console.log(`📊 통계: 총 ${vectors.length}개 (커밋: ${commitCount}, 파일: ${fileCount}, Q&A: ${qaCount})`);

    // 파일 경로 결정
    const defaultPath = compress ? 'output/embeddings.json.gz' : 'output/embeddings.json';
    const filePath = outputPath || defaultPath;

    // 압축 여부에 따라 저장
    if (compress) {
        console.log("🗜️  압축 중...");
        const compressed = await gzipAsync(Buffer.from(jsonString, 'utf-8'));
        await writeFile(filePath, compressed);
        console.log(`✅ 압축 파일 저장 완료: ${filePath} (${(compressed.length / 1024).toFixed(2)} KB)`);
    } else {
        await writeFile(filePath, jsonString, 'utf-8');
        console.log(`✅ 파일 저장 완료: ${filePath} (${(jsonString.length / 1024).toFixed(2)} KB)`);
    }

    return filePath;
}

async function main() {
    console.log("🚀 Embedding File Export Script\n");

    const args = parseArgs();

    console.log("📋 Configuration:");
    console.log(`   Source: ${args.source}`);
    console.log(`   Output: ${args.output || (args.compress ? "output/embeddings.json.gz" : "output/embeddings.json")}`);
    console.log(`   Compress: ${args.compress}`);
    console.log("");

    try {
        let filePath: string;

        if (args.source === "supabase") {
            filePath = await exportFromSupabase(args.output, args.compress);
        } else {
            throw new Error(`지원하지 않는 소스: ${args.source}. 'supabase'만 지원됩니다.`);
        }

        console.log("\n✅ Export completed successfully!");
        console.log(`📁 File: ${filePath}`);
        console.log("\n📌 Next steps:");
        console.log("   1. Git에 커밋: git add output/embeddings.json.gz && git commit -m 'chore: Update embeddings'");
        console.log("   2. GitHub에 푸시: git push");
        console.log("   3. VECTOR_FILE_URL 환경 변수 설정 (GitHub Raw URL)");

    } catch (error: any) {
        console.error("\n❌ Export failed:", error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();
