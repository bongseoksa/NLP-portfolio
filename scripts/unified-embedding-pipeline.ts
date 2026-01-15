#!/usr/bin/env tsx
/**
 * Unified Embedding Pipeline v2.0
 *
 * 주요 기능:
 * 1. 커밋 메시지 임베딩
 * 2. 소스 코드 파일 수집 및 의미 단위 청킹
 * 3. chunkIndex/totalChunks 메타데이터 포함
 */

import { Octokit } from '@octokit/rest';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { chunkSourceCode, type CodeChunk } from './lib/semantic-chunker.js';

const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(__filename); // eslint-disable-line @typescript-eslint/no-unused-vars

dotenv.config();

// Environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GITHUB_TOKEN || !SUPABASE_URL || !SUPABASE_ANON_KEY || !GEMINI_API_KEY) {
  console.error('❌ Missing required environment variables');
  console.error('Required: GITHUB_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY');
  process.exit(1);
}

// Initialize clients
const octokit = new Octokit({ auth: GITHUB_TOKEN });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Configuration
const CONFIG = {
  // 파일 수집 설정
  maxFileSize: 500 * 1024, // 500KB
  excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.cache'],
  includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.md', '.json', '.yaml', '.yml'],
  // 청킹 설정
  maxChunkSize: 4000,
  minChunkSize: 200,
  overlapPercent: 0.08,
  // API 설정
  embeddingDelay: 1000, // 1초 (Gemini rate limit 고려)
  batchSize: 100,
};

// Types
interface Repository {
  owner: string;
  repo: string;
  enabled: boolean;
}

interface TargetRepos {
  repositories: Repository[];
}

interface CommitState {
  version: string;
  repositories: {
    [key: string]: {
      lastCommitSha: string;
      lastTreeSha: string;
      lastUpdated: string;
    };
  };
  lastQATimestamp: string;
  lastCleanupRun: string;
  lastUpdated: string;
}

interface EmbeddingItem {
  id: string;
  type: 'commit' | 'file' | 'qa';
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
}

interface FileInfo {
  path: string;
  content: string;
  sha: string;
  size: number;
  repository: string;
}

// Load target repositories
function loadTargetRepos(): TargetRepos {
  const configPath = path.join(process.cwd(), 'target-repos.json');
  if (!fs.existsSync(configPath)) {
    console.error('❌ target-repos.json not found');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// Load commit state
function loadCommitState(): CommitState {
  const statePath = path.join(process.cwd(), 'commit-state.json');
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  }
  return {
    version: '2.0',
    repositories: {},
    lastQATimestamp: new Date(0).toISOString(),
    lastCleanupRun: new Date(0).toISOString(),
    lastUpdated: new Date().toISOString(),
  };
}

// Save commit state
function saveCommitState(state: CommitState) {
  const statePath = path.join(process.cwd(), 'commit-state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// Determine file type category
function getFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  if (filePath.includes('api/') || filePath.includes('/api')) return 'api';
  if (filePath.includes('components/') || filePath.includes('/components')) return 'component';
  if (filePath.includes('lib/') || filePath.includes('services/')) return 'service';
  if (filePath.includes('hooks/')) return 'hook';
  if (filePath.includes('models/') || filePath.includes('types/')) return 'model';
  if (filePath.includes('test') || filePath.includes('spec')) return 'test';
  if (ext === '.md') return 'docs';
  if (['.json', '.yaml', '.yml'].includes(ext)) return 'config';
  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) return 'src';
  if (ext === '.py') return 'python';

  return 'other';
}

// Check if file should be included
function shouldIncludeFile(filePath: string, size: number): boolean {
  // Size check
  if (size > CONFIG.maxFileSize) return false;

  // Directory exclusion
  for (const excludeDir of CONFIG.excludeDirs) {
    if (filePath.includes(`/${excludeDir}/`) || filePath.startsWith(`${excludeDir}/`)) {
      return false;
    }
  }

  // Extension check
  const ext = path.extname(filePath).toLowerCase();
  if (!CONFIG.includeExtensions.includes(ext)) return false;

  // Skip lock files and generated files
  if (filePath.includes('package-lock.json') || filePath.includes('pnpm-lock.yaml')) return false;
  if (filePath.includes('.min.js') || filePath.includes('.min.css')) return false;

  return true;
}

// Fetch repository tree and file contents
async function fetchRepositoryFiles(owner: string, repo: string): Promise<FileInfo[]> {
  const files: FileInfo[] = [];
  const repoKey = `${owner}/${repo}`;

  try {
    // Get default branch
    const { data: repoInfo } = await octokit.repos.get({ owner, repo });
    const defaultBranch = repoInfo.default_branch;

    // Get repository tree
    const { data: tree } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: defaultBranch,
      recursive: 'true',
    });

    // Filter files
    const fileEntries = tree.tree.filter(item => {
      if (item.type !== 'blob' || !item.path || !item.sha || !item.size) return false;
      return shouldIncludeFile(item.path, item.size);
    });

    console.log(`     Found ${fileEntries.length} files to process`);

    // Fetch file contents (with rate limiting)
    for (let i = 0; i < fileEntries.length; i++) {
      const entry = fileEntries[i];
      if (!entry || !entry.path || !entry.sha || !entry.size) continue;

      const entryPath = entry.path;
      const entrySha = entry.sha;
      const entrySize = entry.size;

      try {
        const { data: blob } = await octokit.git.getBlob({
          owner,
          repo,
          file_sha: entrySha,
        });

        // Decode content
        const content = Buffer.from(blob.content, 'base64').toString('utf-8');

        // Skip binary files
        if (content.includes('\u0000')) continue;

        files.push({
          path: entryPath,
          content,
          sha: entrySha,
          size: entrySize,
          repository: repoKey,
        });

        if ((i + 1) % 20 === 0) {
          process.stdout.write(`\r     Fetched ${i + 1}/${fileEntries.length} files`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch {
        // Skip files that can't be fetched
        continue;
      }
    }

    console.log(`\n     Successfully fetched ${files.length} files`);
    return files;
  } catch (error: any) {
    console.error(`     ❌ Error fetching files from ${repoKey}:`, error.message);
    return [];
  }
}

// Generate embedding with retry
async function generateEmbedding(
  model: any,
  content: string,
  retries: number = 3
): Promise<number[] | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await model.embedContent(content);
      return result.embedding.values;
    } catch (error: any) {
      if (attempt < retries - 1) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
  return null;
}

// Export embeddings to file
async function exportEmbeddingsToFile() {
  try {
    // Fetch all embeddings from Supabase
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
        offset += pageSize;
        hasMore = embeddings.length === pageSize;
      }
    }

    if (allEmbeddings.length === 0) {
      console.log('   ⚠️  No embeddings found in database');
      return;
    }

    console.log(`   Found ${allEmbeddings.length} embeddings to export`);

    // Parse embedding strings
    function parseEmbedding(embedding: any): number[] {
      if (embedding === null || embedding === undefined) return [];
      if (Array.isArray(embedding)) return embedding;
      if (typeof embedding === 'string') {
        const trimmed = embedding.replace(/^\[|\]$/g, '');
        return trimmed.split(',').map(v => parseFloat(v.trim()));
      }
      return [];
    }

    // Calculate statistics
    const stats = {
      totalVectors: allEmbeddings.length,
      commitCount: allEmbeddings.filter(e => e.type === 'commit').length,
      fileCount: allEmbeddings.filter(e => e.type === 'file').length,
      qaCount: allEmbeddings.filter(e => e.type === 'qa').length,
    };

    // Create vector file
    const vectorFile = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      statistics: stats,
      vectors: allEmbeddings.map(e => ({
        id: e.id,
        type: e.type,
        content: e.content,
        embedding: parseEmbedding(e.embedding),
        metadata: e.metadata || {},
      })),
    };

    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Compress and save
    const jsonString = JSON.stringify(vectorFile);
    const compressed = zlib.gzipSync(jsonString);
    const outputPath = path.join(outputDir, 'embeddings.json.gz');
    fs.writeFileSync(outputPath, compressed);

    const compressedSize = compressed.length;
    console.log(`   Exported to: ${outputPath}`);
    console.log(`   File size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB (compressed)`);
    console.log(`   Vectors: ${stats.totalVectors} (commit: ${stats.commitCount}, file: ${stats.fileCount}, qa: ${stats.qaCount})`);

  } catch (error: any) {
    console.error('   ❌ Export failed:', error.message);
    throw error;
  }
}

// Main pipeline
async function runPipeline(resetMode: boolean = false) {
  console.log('🚀 Starting Unified Embedding Pipeline v2.0');
  console.log('   Features: Semantic code chunking, chunkIndex/totalChunks metadata');
  if (resetMode) {
    console.log('   Mode: RESET (full re-generation)');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();
  const stats = {
    repos: 0,
    commits: 0,
    files: 0,
    chunks: 0,
    embeddings: 0,
  };

  try {
    // Phase 1: Setup & Validation
    console.log('[Phase 1: Setup & Validation]');

    console.log('✅ Step 1: Loading configuration...');
    const targetRepos = loadTargetRepos();
    const enabledRepos = targetRepos.repositories.filter(r => r.enabled);
    stats.repos = enabledRepos.length;
    console.log(`   - Repositories: ${enabledRepos.length}`);

    console.log('✅ Step 2: Validating environment...');
    console.log('   - GITHUB_TOKEN: ✓');
    console.log('   - SUPABASE_URL: ✓');
    console.log('   - SUPABASE_ANON_KEY: ✓');
    console.log('   - GEMINI_API_KEY: ✓');

    console.log('✅ Step 3: Loading commit state...');
    let commitState = loadCommitState();
    if (resetMode) {
      console.log('   - Reset mode: clearing state');
      commitState.repositories = {};
      commitState.lastQATimestamp = new Date(0).toISOString();

      // Clear existing embeddings in reset mode
      console.log('   - Clearing existing embeddings...');
      const { error: deleteError } = await supabase
        .from('embeddings')
        .delete()
        .neq('id', 'placeholder'); // Delete all

      if (deleteError) {
        console.warn(`   ⚠️  Could not clear embeddings: ${deleteError.message}`);
      }
    }

    // Phase 2: Data Collection
    console.log('\n[Phase 2: Data Collection]');

    // Step 4: Fetch commits
    console.log('✅ Step 4: Fetching commits from GitHub...');
    const allCommits: any[] = [];

    for (const repo of enabledRepos) {
      const repoKey = `${repo.owner}/${repo.repo}`;
      console.log(`   - Fetching ${repoKey}...`);

      try {
        const { data: commits } = await octokit.repos.listCommits({
          owner: repo.owner,
          repo: repo.repo,
          per_page: 100,
        });

        // Filter new commits if not reset mode
        let newCommits = commits;
        const lastSha = commitState.repositories[repoKey]?.lastCommitSha;
        if (!resetMode && lastSha) {
          const lastIndex = commits.findIndex(c => c.sha === lastSha);
          newCommits = lastIndex >= 0 ? commits.slice(0, lastIndex) : commits;
        }

        console.log(`     Found: ${commits.length} total, ${newCommits.length} new`);

        for (const commit of newCommits) {
          allCommits.push({
            ...commit,
            repoOwner: repo.owner,
            repoName: repo.repo,
          });
        }

        // Update commit state
        if (commits.length > 0) {
          const latestCommit = commits[0];
          if (latestCommit) {
            commitState.repositories[repoKey] = {
              lastCommitSha: latestCommit.sha,
              lastTreeSha: latestCommit.commit.tree.sha,
              lastUpdated: new Date().toISOString(),
            };
          }
        }
      } catch (error: any) {
        console.error(`     ❌ Error fetching ${repoKey}:`, error.message);
      }
    }

    stats.commits = allCommits.length;
    console.log(`   Total new commits: ${allCommits.length}`);

    // Step 5: Fetch source files
    console.log('\n✅ Step 5: Fetching source files from repositories...');
    const allFiles: FileInfo[] = [];

    for (const repo of enabledRepos) {
      const repoKey = `${repo.owner}/${repo.repo}`;
      console.log(`   - Fetching files from ${repoKey}...`);

      const files = await fetchRepositoryFiles(repo.owner, repo.repo);
      allFiles.push(...files);
    }

    stats.files = allFiles.length;
    console.log(`   Total files collected: ${allFiles.length}`);

    // Check if we have any work to do
    if (allCommits.length === 0 && allFiles.length === 0 && !resetMode) {
      console.log('\nℹ️  No new data found. Skipping embedding generation.');
      console.log('✅ Pipeline completed (no changes)\n');
      return;
    }

    // Phase 3: Semantic Chunking
    console.log('\n[Phase 3: Semantic Chunking]');
    console.log('✅ Step 6: Chunking source files with semantic boundaries...');

    interface ChunkedFile {
      fileInfo: FileInfo;
      chunks: CodeChunk[];
    }

    const chunkedFiles: ChunkedFile[] = [];
    let totalChunks = 0;

    for (const file of allFiles) {
      const chunks = chunkSourceCode(file.content, file.path, {
        maxChunkSize: CONFIG.maxChunkSize,
        minChunkSize: CONFIG.minChunkSize,
        overlapPercent: CONFIG.overlapPercent,
      });

      chunkedFiles.push({ fileInfo: file, chunks });
      totalChunks += chunks.length;
    }

    stats.chunks = totalChunks;
    console.log(`   - Files processed: ${allFiles.length}`);
    console.log(`   - Total chunks created: ${totalChunks}`);
    console.log(`   - Average chunks per file: ${(totalChunks / Math.max(allFiles.length, 1)).toFixed(1)}`);

    // Phase 4: Embedding Generation
    console.log('\n[Phase 4: Embedding Generation]');
    console.log('✅ Step 7: Initializing Gemini embedding model...');
    console.log('   - Model: text-embedding-004');
    console.log('   - Dimensions: 768');

    const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const embeddings: EmbeddingItem[] = [];

    // Generate commit embeddings
    if (allCommits.length > 0) {
      console.log(`\n✅ Step 8: Generating commit embeddings (${allCommits.length})...`);

      for (let i = 0; i < allCommits.length; i++) {
        const commit = allCommits[i];
        const content = `Commit: ${commit.commit.message}\nRepository: ${commit.repoOwner}/${commit.repoName}\nAuthor: ${commit.commit.author?.name || 'Unknown'}`;

        const embedding = await generateEmbedding(embeddingModel, content);
        if (embedding) {
          embeddings.push({
            id: `commit-${commit.sha}`,
            type: 'commit',
            content,
            embedding,
            metadata: {
              type: 'commit',
              sha: commit.sha,
              author: commit.commit.author?.name || 'Unknown',
              date: commit.commit.author?.date || new Date().toISOString(),
              message: commit.commit.message,
              repository: `${commit.repoOwner}/${commit.repoName}`,
            },
          });
        }

        if ((i + 1) % 10 === 0 || i === allCommits.length - 1) {
          process.stdout.write(`\r   Progress: ${i + 1}/${allCommits.length}`);
        }

        await new Promise(resolve => setTimeout(resolve, CONFIG.embeddingDelay));
      }
      console.log('');
    }

    // Generate file chunk embeddings
    if (totalChunks > 0) {
      console.log(`\n✅ Step 9: Generating file chunk embeddings (${totalChunks})...`);

      let processedChunks = 0;
      for (const { fileInfo, chunks } of chunkedFiles) {
        for (const chunk of chunks) {
          // Create descriptive content for embedding
          const chunkHeader = chunk.totalChunks > 1
            ? `[Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}] `
            : '';
          const chunkTypeInfo = chunk.name ? `${chunk.type}: ${chunk.name}` : chunk.type;

          const content = `File: ${fileInfo.path}\n${chunkHeader}${chunkTypeInfo}\nLines ${chunk.startLine}-${chunk.endLine}\n\n${chunk.content}`;

          // Generate unique ID
          const chunkId = chunk.totalChunks > 1
            ? `file-${fileInfo.sha}-chunk${chunk.chunkIndex}`
            : `file-${fileInfo.sha}`;

          const embedding = await generateEmbedding(embeddingModel, content.slice(0, 8000)); // Gemini limit
          if (embedding) {
            embeddings.push({
              id: chunkId,
              type: 'file',
              content,
              embedding,
              metadata: {
                type: 'file',
                path: fileInfo.path,
                fileType: getFileType(fileInfo.path),
                size: fileInfo.size,
                extension: path.extname(fileInfo.path),
                repository: fileInfo.repository,
                sha: fileInfo.sha,
                chunkIndex: chunk.chunkIndex,
                totalChunks: chunk.totalChunks,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                chunkType: chunk.type,
                chunkName: chunk.name,
              },
            });
          }

          processedChunks++;
          if (processedChunks % 20 === 0 || processedChunks === totalChunks) {
            process.stdout.write(`\r   Progress: ${processedChunks}/${totalChunks}`);
          }

          await new Promise(resolve => setTimeout(resolve, CONFIG.embeddingDelay));
        }
      }
      console.log('');
    }

    stats.embeddings = embeddings.length;

    // Phase 5: Vector Storage
    console.log('\n[Phase 5: Vector Storage]');
    console.log(`✅ Step 10: Saving ${embeddings.length} embeddings to Supabase...`);

    for (let i = 0; i < embeddings.length; i += CONFIG.batchSize) {
      const batch = embeddings.slice(i, i + CONFIG.batchSize);
      const { error } = await supabase.from('embeddings').upsert(
        batch.map(e => ({
          id: e.id,
          type: e.type,
          content: e.content,
          embedding: e.embedding,
          metadata: e.metadata,
        }))
      );

      if (error) {
        console.error(`   ❌ Batch ${Math.floor(i / CONFIG.batchSize) + 1} failed:`, error.message);
      } else {
        process.stdout.write(`\r   Progress: ${Math.min(i + CONFIG.batchSize, embeddings.length)}/${embeddings.length}`);
      }
    }
    console.log('');

    // Phase 6: Export
    console.log('\n[Phase 6: Export to File]');
    console.log('✅ Step 11: Exporting embeddings to file...');
    await exportEmbeddingsToFile();

    // Phase 7: Finalization
    console.log('\n[Phase 7: Finalization]');
    console.log('✅ Step 12: Updating commit-state.json...');
    commitState.lastUpdated = new Date().toISOString();
    saveCommitState(commitState);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('✅ Step 13: Pipeline completed successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('�� Final Statistics:');
    console.log(`   - Repositories processed: ${stats.repos}`);
    console.log(`   - Commits processed: ${stats.commits}`);
    console.log(`   - Source files processed: ${stats.files}`);
    console.log(`   - Code chunks created: ${stats.chunks}`);
    console.log(`   - Total embeddings generated: ${stats.embeddings}`);
    console.log(`   - Execution time: ${duration}s`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('\n❌ Pipeline failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Parse arguments
const resetMode = process.argv.includes('--reset');

// Run pipeline
runPipeline(resetMode);
