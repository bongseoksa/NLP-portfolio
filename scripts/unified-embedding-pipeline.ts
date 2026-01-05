#!/usr/bin/env tsx
/**
 * 통합 임베딩 파이프라인
 *
 * 20단계 완전 자동화 워크플로우:
 * 1. 환경 설정 및 클라이언트 초기화
 * 2. 대상 레포지토리 로드
 * 3. 상태 파일 로드 (commit-state.json)
 * 4. 커밋/파일/diff 데이터 수집
 * 5. Q&A 히스토리 수집
 * 6. 임베딩 생성
 * 7. 기존 임베딩과 병합
 * 8. 데이터 정리 (age/deleted files/capacity)
 * 9. 파일 내보내기 (embeddings.json.gz)
 * 10. 상태 업데이트 및 저장
 * 11. 통계 출력
 *
 * 사용법:
 *   pnpm run embed:unified              # 일반 모드 (증분 업데이트)
 *   pnpm run embed:unified --reset      # 리셋 모드 (전체 재생성)
 */

import dotenv from 'dotenv';
dotenv.config();

import { Octokit } from '@octokit/rest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { pipeline } from '@xenova/transformers';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { env } from '../shared/config/env.js';
import type { EmbeddingItem } from '../shared/models/EmbeddingItem.js';
import { runCleanup, type Repository, type AllCleanupStats } from './lib/cleanup.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// ============================================================================
// Types
// ============================================================================

interface CommitState {
  version: string;
  repositories: Record<
    string,
    {
      lastCommitSha: string;
      lastTreeSha?: string;
      lastUpdated: string;
    }
  >;
  lastQATimestamp: string;
  lastCleanupRun: string;
  lastUpdated: string;
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

interface UnifiedPipelineOptions {
  reset: boolean;
  skipCleanup: boolean;
  maxSizeMB: number;
}

interface PipelineStats {
  repositories: Record<
    string,
    {
      commits: number;
      files: number;
      embeddings: number;
    }
  >;
  qa: {
    fetched: number;
    embeddings: number;
  };
  cleanup: AllCleanupStats | null;
  final: {
    totalEmbeddings: number;
    fileSizeMB: number;
  };
}

// ============================================================================
// Environment & Initialization
// ============================================================================

function checkEnv(): {
  GITHUB_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
} {
  const githubToken = process.env.GITHUB_TOKEN;
  const supabaseUrl = env.SUPABASE_URL();
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY();

  const missing: string[] = [];
  if (!githubToken) missing.push('GITHUB_TOKEN');
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    console.error('❌ Required environment variables missing:');
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error('\nPlease check your .env file.');
    process.exit(1);
  }

  return {
    GITHUB_TOKEN: githubToken!,
    SUPABASE_URL: supabaseUrl!,
    SUPABASE_SERVICE_ROLE_KEY: supabaseKey!,
  };
}

function loadTargetRepos(): Repository[] {
  const path = 'target-repos.json';
  if (!existsSync(path)) {
    console.error(`❌ ${path} not found.`);
    process.exit(1);
  }

  const content = readFileSync(path, 'utf-8');
  const data = JSON.parse(content);
  return data.repositories.filter((r: Repository) => r.enabled);
}

function loadCommitState(reset: boolean): CommitState {
  const path = 'commit-state.json';

  if (reset) {
    console.log('🔄 Reset mode: Creating new state');
    return {
      version: '2.0',
      repositories: {},
      lastQATimestamp: '1970-01-01T00:00:00.000Z',
      lastCleanupRun: '1970-01-01T00:00:00.000Z',
      lastUpdated: new Date().toISOString(),
    };
  }

  if (existsSync(path)) {
    try {
      const content = readFileSync(path, 'utf-8');
      const state = JSON.parse(content);

      // Migrate from v1.0 to v2.0 if needed
      if (!state.version || state.version === '1.0') {
        console.log('🔄 Migrating commit-state.json from v1.0 to v2.0');
        return {
          version: '2.0',
          repositories: state.repositories || {},
          lastQATimestamp: '1970-01-01T00:00:00.000Z',
          lastCleanupRun: '1970-01-01T00:00:00.000Z',
          lastUpdated: state.lastUpdated || new Date().toISOString(),
        };
      }

      return state;
    } catch {
      console.warn('⚠️  Failed to parse commit-state.json, creating new state');
    }
  }

  return {
    version: '2.0',
    repositories: {},
    lastQATimestamp: '1970-01-01T00:00:00.000Z',
    lastCleanupRun: '1970-01-01T00:00:00.000Z',
    lastUpdated: new Date().toISOString(),
  };
}

function saveCommitState(state: CommitState): void {
  writeFileSync('commit-state.json', JSON.stringify(state, null, 2));
  console.log('✅ commit-state.json saved');
}

// ============================================================================
// GitHub Data Collection
// ============================================================================

async function fetchCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  since?: string
): Promise<any[]> {
  console.log(`📥 Fetching commits from ${owner}/${repo}...`);

  const commits: any[] = [];
  let page = 1;
  const perPage = 100;

  while (commits.length < 100) {
    // Limit to 100 commits max
    const params: any = {
      owner,
      repo,
      per_page: perPage,
      page,
    };

    if (since) {
      params.since = since;
    }

    const { data } = await octokit.repos.listCommits(params);

    if (data.length === 0) break;
    commits.push(...data);

    if (data.length < perPage) break;
    page++;
  }

  console.log(`   ✅ ${commits.length} commits fetched`);
  return commits.slice(0, 100); // Max 100 commits
}

async function fetchRepositoryFiles(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<any[]> {
  console.log(`📁 Fetching files from ${owner}/${repo}...`);

  const { data: repoData } = await octokit.repos.get({
    owner,
    repo,
  });

  const defaultBranch = repoData.default_branch || 'main';

  const { data: tree } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: defaultBranch,
    recursive: '1',
  });

  // Exclude patterns
  const excludePatterns = [
    /node_modules/,
    /\.git/,
    /dist/,
    /build/,
    /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i,
  ];

  const files = tree.tree
    .filter((item: any) => item.type === 'blob')
    .filter((item: any) => {
      const path = item.path || '';
      return (
        !excludePatterns.some((pattern) => pattern.test(path)) &&
        item.size &&
        item.size < 500 * 1024
      ); // 500KB limit
    });

  console.log(`   ✅ ${files.length} files fetched`);
  return files;
}

async function fetchFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
    });

    if ('content' in data && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Q&A History Collection
// ============================================================================

async function fetchQAHistory(
  supabase: SupabaseClient,
  lastQATimestamp: string
): Promise<any[]> {
  console.log(`\n📥 Fetching Q&A history since ${lastQATimestamp}...`);

  const { data, error } = await supabase
    .from('qa_history')
    .select('*')
    .gt('created_at', lastQATimestamp)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('   ⚠️  Q&A history fetch failed:', error.message);
    return [];
  }

  if (!data || data.length === 0) {
    console.log('   ℹ️  No new Q&A items');
    return [];
  }

  console.log(`   ✅ ${data.length} new Q&A items found`);
  return data;
}

// ============================================================================
// Embedding Generation
// ============================================================================

let embeddingModel: any = null;

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!embeddingModel) {
    console.log('📥 Loading Hugging Face model...');
    embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  const result = await embeddingModel(texts, { pooling: 'mean', normalize: true });

  if (Array.isArray(result)) {
    return result.map((emb: any) => {
      if (emb?.data) return Array.from(emb.data);
      return Array.isArray(emb) ? emb : Array.from(emb);
    });
  }

  if (result?.data) {
    return [Array.from(result.data)];
  }

  return [Array.isArray(result) ? result : Array.from(result)];
}

// ============================================================================
// Phase 2: Collect Embeddings
// ============================================================================

async function collectAllEmbeddings(
  octokit: Octokit,
  supabase: SupabaseClient,
  repos: Repository[],
  state: CommitState
): Promise<{ embeddings: EmbeddingItem[]; stats: PipelineStats }> {
  console.log('\n📌 Phase 2: Collect Embeddings');
  console.log('='.repeat(60));

  const allEmbeddings: EmbeddingItem[] = [];
  const stats: PipelineStats = {
    repositories: {},
    qa: { fetched: 0, embeddings: 0 },
    cleanup: null,
    final: { totalEmbeddings: 0, fileSizeMB: 0 },
  };

  // Collect from each repository
  for (const repo of repos) {
    console.log(`\n📦 Processing: ${repo.owner}/${repo.repo}`);
    console.log('-'.repeat(50));

    const repoKey = `${repo.owner}/${repo.repo}`;
    const repoState = state.repositories[repoKey];

    try {
      // Fetch commits
      const commits = await fetchCommits(
        octokit,
        repo.owner,
        repo.repo,
        repoState?.lastUpdated
      );

      // Fetch files
      const files = await fetchRepositoryFiles(octokit, repo.owner, repo.repo);

      // Generate commit embeddings
      for (const commit of commits) {
        const text = `${commit.commit.message} | Author: ${commit.commit.author?.name || 'unknown'}`;
        const embeddingsResult = await generateEmbeddings([text]);
        const embedding = embeddingsResult[0];

        if (embedding) {
          allEmbeddings.push({
            id: `commit-${commit.sha}`,
            type: 'commit',
            content: text,
            embedding,
            metadata: {
              type: 'commit',
              owner: repo.owner,
              repo: repo.repo,
              sha: commit.sha,
              author: commit.commit.author?.name || 'unknown',
              date: commit.commit.author?.date || '',
              message: commit.commit.message,
            },
          });
        }
      }

      // Generate file embeddings (sample max 200)
      const sampleFiles = files.slice(0, 200);
      for (const file of sampleFiles) {
        const content = await fetchFileContent(octokit, repo.owner, repo.repo, file.path);
        if (!content || content.length > 5000) continue; // Skip large files

        const text = `${file.path}: ${content.substring(0, 5000)}`;
        const embeddingsResult = await generateEmbeddings([text]);
        const embedding = embeddingsResult[0];

        if (embedding) {
          allEmbeddings.push({
            id: `file-${file.sha}`,
            type: 'file',
            content: text,
            embedding,
            metadata: {
              type: 'file',
              owner: repo.owner,
              repo: repo.repo,
              path: file.path,
              size: file.size || 0,
              sha: file.sha,
            },
          });
        }
      }

      stats.repositories[repoKey] = {
        commits: commits.length,
        files: sampleFiles.length,
        embeddings: allEmbeddings.length,
      };

      console.log(`   ✅ ${repo.owner}/${repo.repo} completed (${allEmbeddings.length} embeddings)`);
    } catch (error: any) {
      console.error(`   ❌ ${repo.owner}/${repo.repo} failed:`, error.message);
    }
  }

  // Collect Q&A history
  const qaItems = await fetchQAHistory(supabase, state.lastQATimestamp);
  stats.qa.fetched = qaItems.length;

  for (const qa of qaItems) {
    const text = `${qa.question} | ${qa.question_summary || ''}`;
    const embeddingsResult = await generateEmbeddings([text]);
    const embedding = embeddingsResult[0];

    if (embedding) {
      allEmbeddings.push({
        id: `qa-${qa.id}`,
        type: 'qa',
        content: text,
        embedding,
        metadata: {
          type: 'qa',
          qa_id: qa.id,
          category: qa.category,
          timestamp: qa.created_at,
          status: qa.status,
        },
      });
      stats.qa.embeddings++;
    }
  }

  console.log(`\n📊 Phase 2 Summary:`);
  console.log(`   Total new embeddings: ${allEmbeddings.length}`);
  console.log(`   Q&A items: ${stats.qa.embeddings}`);

  return { embeddings: allEmbeddings, stats };
}

// ============================================================================
// Phase 3: Merge Embeddings
// ============================================================================

async function loadExistingEmbeddings(filePath: string): Promise<VectorFile> {
  if (!existsSync(filePath)) {
    console.log('   ℹ️  No existing embeddings file found, starting fresh');
    return {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      statistics: {
        totalEmbeddings: 0,
        commitCount: 0,
        fileCount: 0,
        qaCount: 0,
      },
      vectors: [],
    };
  }

  try {
    const compressed = await readFile(filePath);
    const decompressed = await gunzipAsync(compressed);
    const data = JSON.parse(decompressed.toString('utf-8'));
    console.log(`   ✅ Loaded ${data.vectors.length} existing embeddings`);
    return data;
  } catch (error: any) {
    console.warn('   ⚠️  Failed to load existing embeddings:', error.message);
    return {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      statistics: {
        totalEmbeddings: 0,
        commitCount: 0,
        fileCount: 0,
        qaCount: 0,
      },
      vectors: [],
    };
  }
}

async function mergeEmbeddings(
  existing: EmbeddingItem[],
  newItems: EmbeddingItem[]
): Promise<EmbeddingItem[]> {
  console.log('\n📌 Phase 3: Merge Embeddings');
  console.log('='.repeat(60));

  // Create ID index for deduplication
  const idMap = new Map<string, EmbeddingItem>();

  // Add existing (old items have lower priority)
  for (const item of existing) {
    idMap.set(item.id, item);
  }

  // Add new (new items overwrite old)
  for (const item of newItems) {
    idMap.set(item.id, item);
  }

  const merged = Array.from(idMap.values());

  console.log(`   Existing: ${existing.length}`);
  console.log(`   New:      ${newItems.length}`);
  console.log(`   Merged:   ${merged.length}`);
  console.log(`   ✅ Deduplication complete`);

  return merged;
}

// ============================================================================
// Phase 5: Export
// ============================================================================

async function exportToFile(embeddings: EmbeddingItem[], filePath: string): Promise<number> {
  console.log('\n📌 Phase 5: Export to File');
  console.log('='.repeat(60));

  const commitCount = embeddings.filter((e) => e.type === 'commit').length;
  const fileCount = embeddings.filter((e) => e.type === 'file').length;
  const qaCount = embeddings.filter((e) => e.type === 'qa').length;

  const vectorFile: VectorFile = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    statistics: {
      totalEmbeddings: embeddings.length,
      commitCount,
      fileCount,
      qaCount,
    },
    vectors: embeddings,
  };

  const jsonString = JSON.stringify(vectorFile, null, 2);
  console.log(
    `   📊 Statistics: ${embeddings.length} total (commits: ${commitCount}, files: ${fileCount}, Q&A: ${qaCount})`
  );

  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  console.log('   🗜️  Compressing...');
  const compressed = await gzipAsync(Buffer.from(jsonString, 'utf-8'));
  await writeFile(filePath, compressed);

  const sizeMB = compressed.length / (1024 * 1024);
  console.log(`   ✅ File saved: ${filePath} (${sizeMB.toFixed(2)} MB)`);

  return sizeMB;
}

// ============================================================================
// Main Pipeline
// ============================================================================

async function runUnifiedPipeline(options: UnifiedPipelineOptions): Promise<void> {
  console.log('🚀 Unified Embedding Pipeline Starting\n');
  console.log('📋 Configuration:');
  console.log(`   Reset: ${options.reset}`);
  console.log(`   Skip cleanup: ${options.skipCleanup}`);
  console.log(`   Max size: ${options.maxSizeMB}MB`);
  console.log('');

  // Phase 1: Initialize
  console.log('📌 Phase 1: Initialize');
  console.log('='.repeat(60));

  const envVars = checkEnv();
  const repos = loadTargetRepos();
  const state = loadCommitState(options.reset);

  const octokit = new Octokit({ auth: envVars.GITHUB_TOKEN });
  const supabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

  console.log(`   ✅ Target repositories: ${repos.length}`);
  console.log(`   ✅ State version: ${state.version}`);

  // Phase 2: Collect Embeddings
  const { embeddings: newEmbeddings, stats } = await collectAllEmbeddings(
    octokit,
    supabase,
    repos,
    state
  );

  // Phase 3: Merge with Existing
  const existingFile = await loadExistingEmbeddings('output/embeddings.json.gz');
  let merged = await mergeEmbeddings(existingFile.vectors, newEmbeddings);

  // Phase 4: Cleanup
  if (!options.skipCleanup) {
    const cleanupResult = await runCleanup(merged, octokit, repos, supabase, {
      maxSizeMB: options.maxSizeMB,
      cutoffMonths: 6,
    });
    merged = cleanupResult.cleaned;
    stats.cleanup = cleanupResult.stats;
  } else {
    console.log('\n📌 Phase 4: Data Cleanup');
    console.log('='.repeat(60));
    console.log('   ⏭️  Skipped (--skip-cleanup)');
  }

  // Phase 5: Export
  const fileSizeMB = await exportToFile(merged, 'output/embeddings.json.gz');
  stats.final = {
    totalEmbeddings: merged.length,
    fileSizeMB,
  };

  // Phase 6: Update State
  console.log('\n📌 Phase 6: Update State');
  console.log('='.repeat(60));

  // Update repository states
  for (const repo of repos) {
    const repoKey = `${repo.owner}/${repo.repo}`;
    const repoStats = stats.repositories[repoKey];

    if (repoStats && repoStats.commits > 0) {
      // Get latest commit from new embeddings
      const latestCommit = newEmbeddings
        .filter(
          (e) => e.type === 'commit' && e.metadata.owner === repo.owner && e.metadata.repo === repo.repo
        )
        .sort((a, b) => new Date(b.metadata.date).getTime() - new Date(a.metadata.date).getTime())[0];

      if (latestCommit) {
        state.repositories[repoKey] = {
          lastCommitSha: latestCommit.metadata.sha,
          lastUpdated: new Date().toISOString(),
        };
      }
    }
  }

  // Update Q&A timestamp
  if (stats.qa.embeddings > 0) {
    const latestQA = newEmbeddings
      .filter((e) => e.type === 'qa')
      .sort((a, b) => new Date(b.metadata.timestamp).getTime() - new Date(a.metadata.timestamp).getTime())[0];

    if (latestQA) {
      state.lastQATimestamp = latestQA.metadata.timestamp;
    }
  }

  // Update cleanup timestamp
  if (!options.skipCleanup) {
    state.lastCleanupRun = new Date().toISOString();
  }

  state.lastUpdated = new Date().toISOString();
  saveCommitState(state);

  // Phase 7: Statistics
  console.log('\n📌 Phase 7: Final Statistics');
  console.log('='.repeat(60));
  console.log(`   📦 Repositories processed: ${Object.keys(stats.repositories).length}`);
  Object.entries(stats.repositories).forEach(([repo, repoStats]) => {
    console.log(`      ${repo}: ${repoStats.commits} commits, ${repoStats.files} files`);
  });
  console.log(`   💬 Q&A items: ${stats.qa.embeddings}`);
  if (stats.cleanup) {
    console.log(`   🗑️  Cleanup removed: ${stats.cleanup.total.removed} embeddings`);
  }
  console.log(`   📊 Final embeddings: ${stats.final.totalEmbeddings}`);
  console.log(`   📁 File size: ${stats.final.fileSizeMB.toFixed(2)} MB`);
  console.log('');
  console.log('✅ Unified Pipeline Completed Successfully!');
}

// ============================================================================
// Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  const options: UnifiedPipelineOptions = {
    reset: args.includes('--reset'),
    skipCleanup: process.env.SKIP_CLEANUP === 'true',
    maxSizeMB: parseInt(process.env.MAX_SIZE_MB || '10'),
  };

  await runUnifiedPipeline(options);
}

main().catch((error) => {
  console.error('\n❌ Pipeline failed:', error);
  console.error(error.stack);
  process.exit(1);
});
