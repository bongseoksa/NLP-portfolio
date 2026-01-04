#!/usr/bin/env tsx
/**
 * 로컬 임베딩 파이프라인 실행 스크립트
 * 
 * GitHub 레포지토리에서 커밋과 파일을 가져와 임베딩을 생성하고 Supabase에 저장합니다.
 * 
 * 사용법:
 *   pnpm run embed              # 일반 모드 (증분 업데이트)
 *   pnpm run embed --reset      # 리셋 모드 (전체 재생성)
 */

import dotenv from 'dotenv';
dotenv.config();

import { Octokit } from '@octokit/rest';
import { createClient } from '@supabase/supabase-js';
import { pipeline } from '@xenova/transformers';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { env } from '../shared/config/env.js';
import type { EmbeddingItem } from '../shared/models/EmbeddingItem.js';

const gzipAsync = promisify(gzip);

interface Repository {
  owner: string;
  repo: string;
  enabled: boolean;
  description?: string;
}

interface CommitState {
  repositories: Record<string, { lastCommitSha: string; lastUpdated: string }>;
  lastUpdated: string;
}

// 환경 변수 확인
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
    console.error('❌ 필수 환경 변수가 누락되었습니다:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n.env 파일을 확인해주세요.');
    process.exit(1);
  }

  return {
    GITHUB_TOKEN: githubToken!,
    SUPABASE_URL: supabaseUrl!,
    SUPABASE_SERVICE_ROLE_KEY: supabaseKey!,
  };
}

// target-repos.json 읽기
function loadTargetRepos(): Repository[] {
  const path = 'target-repos.json';
  if (!existsSync(path)) {
    console.error(`❌ ${path} 파일을 찾을 수 없습니다.`);
    process.exit(1);
  }

  const content = readFileSync(path, 'utf-8');
  const data = JSON.parse(content);
  return data.repositories.filter((r: Repository) => r.enabled);
}

// commit-state.json 읽기/쓰기
function loadCommitState(): CommitState {
  const path = 'commit-state.json';
  if (existsSync(path)) {
    try {
      const content = readFileSync(path, 'utf-8');
      return JSON.parse(content);
    } catch {
      console.warn('⚠️  commit-state.json 파싱 실패, 새로 생성합니다.');
    }
  }

  return {
    repositories: {},
    lastUpdated: new Date().toISOString(),
  };
}

function saveCommitState(state: CommitState) {
  writeFileSync('commit-state.json', JSON.stringify(state, null, 2));
  console.log('✅ commit-state.json 저장 완료');
}

// GitHub API로 커밋 가져오기
async function fetchCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  since?: string
): Promise<any[]> {
  console.log(`📥 ${owner}/${repo} 커밋 가져오는 중...`);
  
  const commits: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
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

  console.log(`   ✅ ${commits.length}개 커밋 조회 완료`);
  return commits;
}

// 레포지토리 파일 가져오기
async function fetchRepositoryFiles(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<any[]> {
  console.log(`📁 ${owner}/${repo} 파일 가져오는 중...`);
  
  async function getTreeRecursive(sha: string, path: string = ''): Promise<any[]> {
    const { data } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: sha,
      recursive: '1',
    });

    return data.tree.filter((item: any) => item.type === 'blob');
  }

  const { data: repoData } = await octokit.repos.get({
    owner,
    repo,
  });

  const defaultBranch = repoData.default_branch || 'main';
  const tree = await getTreeRecursive(defaultBranch);
  
  // 제외할 파일 패턴
  const excludePatterns = [
    /node_modules/,
    /\.git/,
    /dist/,
    /build/,
    /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i,
  ];

  const files = tree.filter((item: any) => {
    const path = item.path || '';
    return !excludePatterns.some(pattern => pattern.test(path)) &&
           item.size && item.size < 500 * 1024; // 500KB 미만
  });

  console.log(`   ✅ ${files.length}개 파일 조회 완료`);
  return files;
}

// 파일 내용 가져오기
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

// 임베딩 생성 (Hugging Face)
let embeddingModel: any = null;

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!embeddingModel) {
    console.log('📥 Hugging Face 모델 로딩 중...');
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

// Supabase에 저장
async function saveToSupabase(
  supabase: any,
  embeddings: EmbeddingItem[],
  owner: string,
  repo: string
): Promise<void> {
  console.log(`💾 Supabase에 ${embeddings.length}개 임베딩 저장 중...`);

  const batchSize = 100;
  for (let i = 0; i < embeddings.length; i += batchSize) {
    const batch = embeddings.slice(i, i + batchSize);
    
    const records = batch.map(e => ({
      id: e.id,
      type: e.type,
      content: e.content,
      embedding: e.embedding,
      metadata: {
        ...e.metadata,
        owner,
        repo,
      },
    }));

    const { error } = await supabase
      .from('embeddings')
      .upsert(records, { onConflict: 'id' });

    if (error) {
      console.error(`❌ 배치 ${i / batchSize + 1} 저장 실패:`, error.message);
      throw error;
    }

    process.stdout.write(`\r   진행률: ${Math.min(i + batchSize, embeddings.length)}/${embeddings.length}`);
  }
  
  console.log('\n   ✅ 저장 완료');
}

// 메인 파이프라인
async function runPipeline(reset: boolean = false) {
  console.log('🚀 임베딩 파이프라인 시작\n');

  const envVars = checkEnv();
  const repos = loadTargetRepos();
  let commitState = reset ? {
    repositories: {},
    lastUpdated: new Date().toISOString(),
  } : loadCommitState();

  const octokit = new Octokit({ auth: envVars.GITHUB_TOKEN });
  const supabase = createClient(
    envVars.SUPABASE_URL,
    envVars.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log(`📋 대상 레포지토리: ${repos.length}개\n`);

  for (const repo of repos) {
    console.log(`\n📦 처리 중: ${repo.owner}/${repo.repo}`);
    console.log('='.repeat(50));

    try {
      // 커밋 가져오기
      const lastCommitSha = commitState.repositories[`${repo.owner}/${repo.repo}`]?.lastCommitSha;
      const commits = await fetchCommits(
        octokit,
        repo.owner,
        repo.repo,
        reset ? undefined : lastCommitSha ? undefined : undefined
      );

      if (commits.length === 0 && !reset) {
        console.log('   ℹ️  새로운 커밋이 없습니다.');
        continue;
      }

      // 파일 가져오기
      const files = await fetchRepositoryFiles(octokit, repo.owner, repo.repo);

      // 임베딩 생성
      const embeddings: EmbeddingItem[] = [];

      // 커밋 임베딩
      for (const commit of commits.slice(0, 100)) { // 최대 100개
        const text = `${commit.commit.message} | Author: ${commit.commit.author?.name || 'unknown'}`;
        const embeddingsResult = await generateEmbeddings([text]);
        const embedding = embeddingsResult[0];
        
        if (!embedding) {
          console.warn(`   ⚠️  커밋 ${commit.sha} 임베딩 생성 실패`);
          continue;
        }
        
        embeddings.push({
          id: `commit-${commit.sha}`,
          type: 'commit',
          content: text,
          embedding,
          metadata: {
            type: 'commit',
            sha: commit.sha,
            author: commit.commit.author?.name || 'unknown',
            date: commit.commit.author?.date || '',
            message: commit.commit.message,
          },
        });
      }

      // 파일 임베딩 (샘플링: 최대 200개)
      const sampleFiles = files.slice(0, 200);
      for (const file of sampleFiles) {
        const content = await fetchFileContent(octokit, repo.owner, repo.repo, file.path);
        if (!content || content.length > 5000) continue; // 5KB 초과 스킵

        const text = `${file.path}: ${content.substring(0, 5000)}`;
        const embeddingsResult = await generateEmbeddings([text]);
        const embedding = embeddingsResult[0];
        
        if (!embedding) {
          console.warn(`   ⚠️  파일 ${file.path} 임베딩 생성 실패`);
          continue;
        }
        
        embeddings.push({
          id: `file-${file.sha}`,
          type: 'file',
          content: text,
          embedding,
          metadata: {
            type: 'file',
            path: file.path,
            size: file.size || 0,
            sha: file.sha,
          },
        });
      }

      console.log(`\n📊 생성된 임베딩: ${embeddings.length}개`);

      // Supabase에 저장
      if (embeddings.length > 0) {
        await saveToSupabase(supabase, embeddings, repo.owner, repo.repo);
      }

      // 상태 업데이트
      if (commits.length > 0) {
        commitState.repositories[`${repo.owner}/${repo.repo}`] = {
          lastCommitSha: commits[0].sha,
          lastUpdated: new Date().toISOString(),
        };
      }

      console.log(`✅ ${repo.owner}/${repo.repo} 처리 완료\n`);

    } catch (error: any) {
      console.error(`❌ ${repo.owner}/${repo.repo} 처리 실패:`, error.message);
      console.error(error.stack);
    }
  }

  // 상태 저장
  commitState.lastUpdated = new Date().toISOString();
  saveCommitState(commitState);

  console.log('\n✅ 파이프라인 완료!');
  console.log('\n📌 다음 단계:');
  console.log('   pnpm run local_export  # Supabase에서 파일로 내보내기');
}

// 메인 실행
const args = process.argv.slice(2);
const reset = args.includes('--reset');

runPipeline(reset).catch((error) => {
  console.error('\n❌ 파이프라인 실행 실패:', error);
  process.exit(1);
});

