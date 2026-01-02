#!/usr/bin/env tsx
/**
 * 임베딩을 파일로 내보내기 스크립트
 *
 * 사용법:
 *   pnpm tsx scripts/export-embeddings.ts --source supabase
 *   pnpm tsx scripts/export-embeddings.ts --source chromadb --collection portfolio-vectors
 *   pnpm tsx scripts/export-embeddings.ts --upload vercel
 *   pnpm tsx scripts/export-embeddings.ts --upload s3 --bucket my-bucket
 */

import dotenv from "dotenv";
dotenv.config();

import {
    exportFromSupabase,
    exportFromChromaDB,
    exportEmbeddingsToFile
} from "../src/embedding-pipeline/storage/exportToFile.js";

interface Args {
    source: "supabase" | "chromadb";
    collection?: string;
    upload?: "vercel" | "s3";
    bucket?: string;
    region?: string;
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
            parsed.source = args[i + 1] as "supabase" | "chromadb";
            i++;
        } else if (arg === "--collection" && args[i + 1]) {
            parsed.collection = args[i + 1];
            i++;
        } else if (arg === "--upload" && args[i + 1]) {
            parsed.upload = args[i + 1] as "vercel" | "s3";
            i++;
        } else if (arg === "--bucket" && args[i + 1]) {
            parsed.bucket = args[i + 1];
            i++;
        } else if (arg === "--region" && args[i + 1]) {
            parsed.region = args[i + 1];
            i++;
        } else if (arg === "--output" && args[i + 1]) {
            parsed.output = args[i + 1];
            i++;
        } else if (arg === "--no-compress") {
            parsed.compress = false;
        }
    }

    return parsed as Args;
}

async function main() {
    console.log("🚀 Embedding File Export Script\n");

    const args = parseArgs();

    console.log("📋 Configuration:");
    console.log(`   Source: ${args.source}`);
    console.log(`   Output: ${args.output || "output/embeddings.json"}`);
    console.log(`   Compress: ${args.compress}`);
    if (args.upload) {
        console.log(`   Upload: ${args.upload}`);
    }
    console.log("");

    try {
        let filePath: string;

        if (args.source === "supabase") {
            // Supabase에서 내보내기
            filePath = await exportFromSupabase({
                outputPath: args.output,
                compress: args.compress,
                uploadToVercelBlob: args.upload === "vercel",
                uploadToS3: args.upload === "s3" ? {
                    bucket: args.bucket || process.env.AWS_S3_BUCKET || "",
                    region: args.region || process.env.AWS_REGION,
                    key: "embeddings.json.gz"
                } : undefined
            });

        } else if (args.source === "chromadb") {
            // ChromaDB에서 내보내기
            if (!args.collection) {
                const repoName = process.env.TARGET_REPO_NAME || "portfolio";
                args.collection = `${repoName}-vectors`;
            }

            filePath = await exportFromChromaDB(args.collection, {
                outputPath: args.output,
                compress: args.compress,
                uploadToVercelBlob: args.upload === "vercel",
                uploadToS3: args.upload === "s3" ? {
                    bucket: args.bucket || process.env.AWS_S3_BUCKET || "",
                    region: args.region || process.env.AWS_REGION,
                    key: "embeddings.json.gz"
                } : undefined
            });

        } else {
            throw new Error(`Unknown source: ${args.source}`);
        }

        console.log("\n✅ Export completed successfully!");
        console.log(`📁 File: ${filePath}`);

        if (args.upload) {
            console.log("\n📌 Next steps:");
            console.log("   1. Set VECTOR_FILE_URL in your production environment");
            console.log("   2. Deploy your service with the new URL");
            console.log("   3. Test with: pnpm run ask \"test question\"");
        }

    } catch (error: any) {
        console.error("\n❌ Export failed:", error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
