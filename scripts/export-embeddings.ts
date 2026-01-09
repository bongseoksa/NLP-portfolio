#!/usr/bin/env tsx
/**
 * Export Embeddings Script
 * Supabase에서 임베딩을 가져와 gzip 압축된 JSON 파일로 내보냅니다.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
dotenv.config();

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing required environment variables');
  console.error('Required: SUPABASE_URL, SUPABASE_ANON_KEY');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Types
interface EmbeddingItem {
  id: string;
  type: 'commit' | 'file' | 'qa';
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
}

interface VectorFile {
  version: string;
  exportedAt: string;
  statistics: {
    totalVectors: number;
    commitCount: number;
    fileCount: number;
    qaCount: number;
  };
  vectors: EmbeddingItem[];
}

async function exportEmbeddings() {
  console.log('🚀 Starting Embeddings Export');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();

  try {
    // Step 1: Fetch all embeddings from Supabase
    console.log('📥 Step 1: Fetching embeddings from Supabase...');

    // Supabase has a default limit of 1000 rows, so we need to paginate
    const allEmbeddings: any[] = [];
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: embeddings, error } = await supabase
        .from('embeddings')
        .select('id, type, content, embedding, metadata')
        .order('id')
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error(`Failed to fetch embeddings: ${error.message}`);
      }

      if (!embeddings || embeddings.length === 0) {
        hasMore = false;
      } else {
        allEmbeddings.push(...embeddings);
        console.log(`   Fetched ${allEmbeddings.length} embeddings...`);
        offset += pageSize;
        hasMore = embeddings.length === pageSize;
      }
    }

    const embeddings = allEmbeddings;

    if (embeddings.length === 0) {
      console.log('⚠️  No embeddings found in database');
      return;
    }

    console.log(`   Found ${embeddings.length} embeddings`);

    // Step 2: Calculate statistics
    console.log('\n📊 Step 2: Calculating statistics...');

    const stats = {
      totalVectors: embeddings.length,
      commitCount: embeddings.filter(e => e.type === 'commit').length,
      fileCount: embeddings.filter(e => e.type === 'file').length,
      qaCount: embeddings.filter(e => e.type === 'qa').length,
    };

    console.log(`   - Total vectors: ${stats.totalVectors}`);
    console.log(`   - Commit embeddings: ${stats.commitCount}`);
    console.log(`   - File embeddings: ${stats.fileCount}`);
    console.log(`   - Q&A embeddings: ${stats.qaCount}`);

    // Step 3: Create vector file structure
    console.log('\n📦 Step 3: Creating vector file...');

    const vectorFile: VectorFile = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      statistics: stats,
      vectors: embeddings.map(e => ({
        id: e.id,
        type: e.type as 'commit' | 'file' | 'qa',
        content: e.content,
        embedding: e.embedding,
        metadata: e.metadata || {},
      })),
    };

    // Step 4: Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log('   Created output directory');
    }

    // Step 5: Compress and save
    console.log('\n💾 Step 4: Compressing and saving...');

    const jsonString = JSON.stringify(vectorFile);
    const compressed = zlib.gzipSync(jsonString);

    const outputPath = path.join(outputDir, 'embeddings.json.gz');
    fs.writeFileSync(outputPath, compressed);

    const uncompressedSize = Buffer.byteLength(jsonString, 'utf-8');
    const compressedSize = compressed.length;
    const compressionRatio = ((1 - compressedSize / uncompressedSize) * 100).toFixed(1);

    console.log(`   - Uncompressed size: ${(uncompressedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   - Compressed size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   - Compression ratio: ${compressionRatio}%`);
    console.log(`   - Output file: ${outputPath}`);

    // Done
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Export completed successfully!');
    console.log(`   Execution time: ${duration}s`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('\n❌ Export failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run export
exportEmbeddings();
