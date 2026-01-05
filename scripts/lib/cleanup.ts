/**
 * 임베딩 정리 모듈
 *
 * 3가지 정리 전략:
 * 1. Age-based: 6개월 초과 데이터 삭제
 * 2. Deleted files: GitHub에 존재하지 않는 파일 임베딩 제거
 * 3. Capacity limit: 용량 초과 시 우선순위 기반 pruning
 */

import type { Octokit } from '@octokit/rest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { gzip } from 'zlib';
import { promisify } from 'util';
import type { EmbeddingItem } from '../../shared/models/EmbeddingItem.js';

const gzipAsync = promisify(gzip);

export interface Repository {
  owner: string;
  repo: string;
  enabled: boolean;
  description?: string;
}

export interface CleanupStats {
  before: number;
  after: number;
  removed: number;
}

export interface AllCleanupStats {
  age: CleanupStats;
  deletedFiles: CleanupStats;
  capacity: CleanupStats;
  total: {
    before: number;
    after: number;
    removed: number;
  };
}

/**
 * 1. Age-based cleanup (6개월 초과 데이터 삭제)
 */
export async function cleanupByAge(
  embeddings: EmbeddingItem[],
  supabase: SupabaseClient | null,
  cutoffMonths: number = 6
): Promise<{ cleaned: EmbeddingItem[]; stats: CleanupStats }> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - cutoffMonths);
  const cutoffMs = cutoffDate.getTime();

  console.log(`\n🗑️  Age-based cleanup (cutoff: ${cutoffDate.toISOString().split('T')[0]})...`);

  const filtered = embeddings.filter((item) => {
    let itemDate: Date | null = null;

    if (item.type === 'commit' && item.metadata.date) {
      itemDate = new Date(item.metadata.date);
    } else if (item.type === 'qa' && item.metadata.timestamp) {
      itemDate = new Date(item.metadata.timestamp);
    } else if (item.type === 'file' && item.metadata.commitDate) {
      itemDate = new Date(item.metadata.commitDate);
    }

    // Keep if no date or within retention period
    return !itemDate || itemDate.getTime() >= cutoffMs;
  });

  const removed = embeddings.length - filtered.length;
  console.log(`   ✅ Removed ${removed} embeddings older than ${cutoffMonths} months`);

  // Also delete from Supabase
  if (supabase && removed > 0) {
    await deleteOldEmbeddingsFromSupabase(supabase, cutoffDate);
  }

  return {
    cleaned: filtered,
    stats: {
      before: embeddings.length,
      after: filtered.length,
      removed,
    },
  };
}

async function deleteOldEmbeddingsFromSupabase(
  supabase: SupabaseClient,
  cutoffDate: Date
): Promise<void> {
  try {
    const { error } = await supabase
      .from('embeddings')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      console.warn('   ⚠️  Supabase cleanup failed:', error.message);
    } else {
      console.log('   ✅ Supabase age cleanup completed');
    }
  } catch (error: any) {
    console.warn('   ⚠️  Supabase cleanup error:', error.message);
  }
}

/**
 * 2. Deleted files cleanup (GitHub tree 비교)
 */
export async function cleanupDeletedFiles(
  embeddings: EmbeddingItem[],
  octokit: Octokit,
  repos: Repository[],
  supabase: SupabaseClient | null
): Promise<{ cleaned: EmbeddingItem[]; stats: CleanupStats }> {
  console.log(`\n🗑️  Deleted files cleanup...`);
  console.log('   🔍 Fetching current file trees from GitHub...');

  // Build set of current files from GitHub
  const currentFiles = new Set<string>();

  for (const repo of repos) {
    try {
      // Get default branch
      const { data: repoData } = await octokit.repos.get({
        owner: repo.owner,
        repo: repo.repo,
      });

      const defaultBranch = repoData.default_branch || 'main';

      // Get tree recursively
      const { data: tree } = await octokit.git.getTree({
        owner: repo.owner,
        repo: repo.repo,
        tree_sha: defaultBranch,
        recursive: '1',
      });

      tree.tree.forEach((item) => {
        if (item.type === 'blob' && item.path) {
          const fileKey = `${repo.owner}/${repo.repo}:${item.path}`;
          currentFiles.add(fileKey);
        }
      });

      console.log(`   ✅ ${repo.owner}/${repo.repo}: ${tree.tree.filter((i) => i.type === 'blob').length} files`);
    } catch (error: any) {
      console.warn(`   ⚠️  Failed to fetch tree for ${repo.owner}/${repo.repo}:`, error.message);
    }
  }

  console.log(`   📊 Total current files: ${currentFiles.size}`);

  // Filter out embeddings for deleted files
  const filtered = embeddings.filter((item) => {
    if (item.type !== 'file') return true;

    const owner = item.metadata.owner;
    const repo = item.metadata.repo;
    const path = item.metadata.path;

    if (!owner || !repo || !path) return true;

    const fileKey = `${owner}/${repo}:${path}`;
    return currentFiles.has(fileKey);
  });

  const removed = embeddings.length - filtered.length;
  console.log(`   ✅ Removed ${removed} embeddings for deleted files`);

  // Also delete from Supabase
  if (supabase && removed > 0) {
    await deleteDeletedFilesFromSupabase(supabase, embeddings, filtered);
  }

  return {
    cleaned: filtered,
    stats: {
      before: embeddings.length,
      after: filtered.length,
      removed,
    },
  };
}

async function deleteDeletedFilesFromSupabase(
  supabase: SupabaseClient,
  before: EmbeddingItem[],
  after: EmbeddingItem[]
): Promise<void> {
  try {
    // Get IDs of deleted items
    const afterIds = new Set(after.map((e) => e.id));
    const deletedIds = before
      .filter((e) => e.type === 'file' && !afterIds.has(e.id))
      .map((e) => e.id);

    if (deletedIds.length === 0) return;

    // Delete in batches
    const batchSize = 100;
    for (let i = 0; i < deletedIds.length; i += batchSize) {
      const batch = deletedIds.slice(i, i + batchSize);
      const { error } = await supabase.from('embeddings').delete().in('id', batch);

      if (error) {
        console.warn('   ⚠️  Supabase batch delete failed:', error.message);
      }
    }

    console.log('   ✅ Supabase deleted files cleanup completed');
  } catch (error: any) {
    console.warn('   ⚠️  Supabase deleted files cleanup error:', error.message);
  }
}

/**
 * 3. Capacity limit enforcement (우선순위 기반 pruning)
 */
export async function enforceCapacityLimit(
  embeddings: EmbeddingItem[],
  maxSizeMB: number
): Promise<{ cleaned: EmbeddingItem[]; stats: CleanupStats }> {
  console.log(`\n🗜️  Capacity limit enforcement (limit: ${maxSizeMB}MB)...`);

  // Estimate compressed size
  const jsonStr = JSON.stringify({ vectors: embeddings });
  const compressed = await gzipAsync(Buffer.from(jsonStr, 'utf-8'));
  const currentSizeMB = compressed.length / (1024 * 1024);

  console.log(`   📊 Current size: ${currentSizeMB.toFixed(2)} MB`);

  if (currentSizeMB <= maxSizeMB) {
    console.log('   ✅ Within capacity limit, no pruning needed');
    return {
      cleaned: embeddings,
      stats: {
        before: embeddings.length,
        after: embeddings.length,
        removed: 0,
      },
    };
  }

  console.log(`   ⚠️  Exceeds limit by ${(currentSizeMB - maxSizeMB).toFixed(2)} MB`);

  // Calculate target count (aim for 95% of limit for safety)
  const reductionRatio = maxSizeMB / currentSizeMB;
  const targetCount = Math.floor(embeddings.length * reductionRatio * 0.95);

  console.log(`   🎯 Target: ${targetCount} embeddings (reduction: ${embeddings.length - targetCount})`);

  // Priority-based pruning
  const scored = embeddings.map((item) => ({
    item,
    score: calculatePruningScore(item),
  }));

  scored.sort((a, b) => b.score - a.score);
  const kept = scored.slice(0, targetCount).map((s) => s.item);

  console.log(`   ✅ Reduced from ${embeddings.length} to ${kept.length} embeddings`);

  return {
    cleaned: kept,
    stats: {
      before: embeddings.length,
      after: kept.length,
      removed: embeddings.length - kept.length,
    },
  };
}

function calculatePruningScore(item: EmbeddingItem): number {
  const now = Date.now();
  const threeMonths = 90 * 24 * 60 * 60 * 1000;
  const oneMonth = 30 * 24 * 60 * 60 * 1000;

  if (item.type === 'commit') {
    if (!item.metadata.date) return 50;
    const age = now - new Date(item.metadata.date).getTime();
    return age < threeMonths ? 100 : 50;
  }

  if (item.type === 'file') {
    let score = 40;

    // Prioritize source files
    const path = item.metadata.path || '';
    const isSource = /\.(ts|tsx|js|jsx|py|java|go|rs|c|cpp|h|hpp)$/i.test(path);
    if (isSource) score += 40;

    // Penalize chunks (keep first chunk, prune others)
    if (item.metadata.chunkIndex && item.metadata.chunkIndex > 0) {
      score -= 30;
    }

    return score;
  }

  if (item.type === 'qa') {
    if (!item.metadata.timestamp) return 30;
    const age = now - new Date(item.metadata.timestamp).getTime();
    return age < oneMonth ? 90 : 30;
  }

  return 0;
}

/**
 * Run all cleanup steps
 */
export async function runCleanup(
  embeddings: EmbeddingItem[],
  octokit: Octokit,
  repos: Repository[],
  supabase: SupabaseClient | null,
  options: {
    maxSizeMB: number;
    cutoffMonths?: number;
  }
): Promise<{ cleaned: EmbeddingItem[]; stats: AllCleanupStats }> {
  console.log('\n📌 Phase 4: Data Cleanup');
  console.log('='.repeat(60));

  const initialCount = embeddings.length;

  // Step 1: Age-based cleanup
  const ageResult = await cleanupByAge(embeddings, supabase, options.cutoffMonths || 6);
  let cleaned = ageResult.cleaned;

  // Step 2: Deleted files cleanup
  const filesResult = await cleanupDeletedFiles(cleaned, octokit, repos, supabase);
  cleaned = filesResult.cleaned;

  // Step 3: Capacity limit enforcement
  const capacityResult = await enforceCapacityLimit(cleaned, options.maxSizeMB);
  cleaned = capacityResult.cleaned;

  const totalRemoved = initialCount - cleaned.length;

  console.log('\n📊 Cleanup Summary:');
  console.log(`   Age-based:      ${ageResult.stats.removed} removed`);
  console.log(`   Deleted files:  ${filesResult.stats.removed} removed`);
  console.log(`   Capacity limit: ${capacityResult.stats.removed} removed`);
  console.log(`   Total:          ${totalRemoved} removed (${initialCount} → ${cleaned.length})`);

  return {
    cleaned,
    stats: {
      age: ageResult.stats,
      deletedFiles: filesResult.stats,
      capacity: capacityResult.stats,
      total: {
        before: initialCount,
        after: cleaned.length,
        removed: totalRemoved,
      },
    },
  };
}
