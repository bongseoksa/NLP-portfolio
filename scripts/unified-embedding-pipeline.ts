#!/usr/bin/env tsx
import { Octokit } from '@octokit/rest';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      version: '1.0',
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
  console.log('🚀 Starting Unified Embedding Pipeline');
  if (resetMode) {
    console.log('   Mode: RESET (full re-generation)');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();

  try {
    // Phase 1: Setup & Validation
    console.log('[Phase 1: Setup & Validation]');

    console.log('✅ Step 1: Loading configuration...');
    const targetRepos = loadTargetRepos();
    const enabledRepos = targetRepos.repositories.filter(r => r.enabled);
    console.log(`   - Repositories: ${enabledRepos.length}`);

    console.log('✅ Step 2: Validating environment...');
    console.log('   - GITHUB_TOKEN: ✓');
    console.log('   - SUPABASE_URL: ✓');
    console.log('   - SUPABASE_ANON_KEY: ✓');

    console.log('✅ Step 3: Loading commit state...');
    let commitState = loadCommitState();
    if (resetMode) {
      console.log('   - Reset mode: clearing state');
      commitState.repositories = {};
      commitState.lastQATimestamp = new Date(0).toISOString();
    }

    // Phase 2: Data Collection
    console.log('\n[Phase 2: Data Collection]');

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

    console.log(`   Total new commits: ${allCommits.length}`);

    if (allCommits.length === 0 && !resetMode) {
      console.log('\nℹ️  No new commits found. Skipping embedding generation.');
      console.log('✅ Pipeline completed (no changes)\n');
      return;
    }

    // Phase 3: Embedding Generation
    console.log('\n[Phase 3: Embedding Generation]');
    console.log('✅ Step 8: Initializing Gemini embedding model...');
    console.log('   - Model: text-embedding-004');
    console.log('   - Dimensions: 768');

    console.log('✅ Step 9: Generating commit embeddings...');
    const embeddings: EmbeddingItem[] = [];
    const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

    // Process one at a time to avoid rate limits
    for (let i = 0; i < allCommits.length; i++) {
      const commit = allCommits[i];
      const content = `${commit.commit.message} | Repo: ${commit.repoOwner}/${commit.repoName}`;

      try {
        const result = await embeddingModel.embedContent(content);
        const embedding = result.embedding.values;

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

        if ((i + 1) % 10 === 0 || i === allCommits.length - 1) {
          process.stdout.write(`\r   Progress: ${i + 1}/${allCommits.length}`);
        }

        // Small delay to avoid rate limits (15 RPM limit)
        if (i < allCommits.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 4000)); // 4초 대기 (15 RPM)
        }
      } catch (error: any) {
        console.error(`\n   ❌ Commit ${i + 1} failed:`, error.message);
        // Continue with next commit even if one fails
      }
    }
    console.log('\n');

    // Phase 4: Vector Storage
    console.log('\n[Phase 4: Vector Storage]');
    console.log('✅ Step 12: Saving to Supabase pgvector...');
    console.log(`   - Total vectors: ${embeddings.length}`);

    const saveBatchSize = 100;
    for (let i = 0; i < embeddings.length; i += saveBatchSize) {
      const batch = embeddings.slice(i, i + saveBatchSize);
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
        console.error(`   ❌ Batch ${i / saveBatchSize + 1} failed:`, error.message);
      } else {
        process.stdout.write(`\r   Progress: ${Math.min(i + saveBatchSize, embeddings.length)}/${embeddings.length}`);
      }
    }
    console.log('\n');

    // Phase 7: Export to file
    console.log('\n[Phase 7: Export to file]');
    console.log('✅ Step 19: Exporting embeddings to file...');
    await exportEmbeddingsToFile();

    // Phase 8: Finalization
    console.log('\n[Phase 8: Finalization]');
    console.log('✅ Step 20: Updating commit-state.json...');
    commitState.lastUpdated = new Date().toISOString();
    saveCommitState(commitState);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('✅ Step 21: Pipeline completed successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Final Statistics:');
    console.log(`   - Repositories: ${enabledRepos.length}`);
    console.log(`   - Commits processed: ${allCommits.length}`);
    console.log(`   - Embeddings created: ${embeddings.length}`);
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
