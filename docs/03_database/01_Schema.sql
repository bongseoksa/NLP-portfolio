-- ============================================================
-- NLP-Portfolio Supabase Database Schema
-- ============================================================
-- Version: 1.0
-- Last Updated: 2026-01-03
-- Database: PostgreSQL 15 + pgvector extension
-- ============================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Table: qa_history
-- Purpose: 사용자 질의응답 원문 저장
-- ============================================================
CREATE TABLE IF NOT EXISTS qa_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  question TEXT NOT NULL,                     -- 사용자 질문
  answer TEXT NOT NULL,                        -- 시스템 응답
  category TEXT,                               -- 질문 카테고리 (예: "architecture", "implementation")
  confidence NUMERIC(3, 2),                    -- 신뢰도 (0.00 ~ 1.00)
  processing_time_ms INTEGER,                  -- 응답 생성 시간 (밀리초)
  sources JSONB,                               -- 참조한 소스 목록
  metadata JSONB,                              -- 추가 메타데이터
  status TEXT DEFAULT 'success',               -- 'success' | 'partial' | 'failed'
  llm_provider TEXT,                           -- 사용한 LLM (예: "claude", "gemini", "mistral")

  -- Indexes
  CONSTRAINT qa_history_status_check CHECK (status IN ('success', 'partial', 'failed'))
);

-- Indexes for faster queries
CREATE INDEX idx_qa_history_created_at ON qa_history(created_at DESC);
CREATE INDEX idx_qa_history_category ON qa_history(category) WHERE category IS NOT NULL;
CREATE INDEX idx_qa_history_status ON qa_history(status);
CREATE INDEX idx_qa_history_llm_provider ON qa_history(llm_provider) WHERE llm_provider IS NOT NULL;

-- Full-text search index (optional)
CREATE INDEX idx_qa_history_question_fts ON qa_history USING GIN (to_tsvector('english', question));

-- ============================================================
-- Table: embeddings
-- Purpose: 임베딩 벡터 임시 저장 (CI 단계 전용)
-- ============================================================
CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,                         -- "commit-{sha}" | "file-{sha}-{index}" | "qa-{id}"
  type TEXT NOT NULL,                          -- 'commit' | 'file' | 'qa'
  content TEXT NOT NULL,                       -- 원본 텍스트
  embedding vector(384),                       -- 임베딩 벡터 (all-MiniLM-L6-v2: 384 dimensions)
  metadata JSONB NOT NULL,                     -- 메타데이터 (type별 구조 다름)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT embeddings_type_check CHECK (type IN ('commit', 'file', 'qa'))
);

-- Indexes
CREATE INDEX idx_embeddings_type ON embeddings(type);
CREATE INDEX idx_embeddings_created_at ON embeddings(created_at DESC);

-- Vector similarity search index (ivfflat)
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_embeddings_updated_at
BEFORE UPDATE ON embeddings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: ping
-- Purpose: Supabase Free Tier 유지 목적 (GitHub Actions 주간 실행)
-- ============================================================
CREATE TABLE IF NOT EXISTS ping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,                        -- 'success' | 'error'
  http_code INTEGER,                           -- HTTP 응답 코드
  response_time_ms INTEGER,                    -- 응답 시간 (밀리초)
  error_message TEXT,                          -- 에러 메시지 (있을 경우)
  triggered_by TEXT DEFAULT 'github_actions',  -- 실행 주체

  -- Constraints
  CONSTRAINT ping_status_check CHECK (status IN ('success', 'error'))
);

-- Indexes
CREATE INDEX idx_ping_created_at ON ping(created_at DESC);
CREATE INDEX idx_ping_status ON ping(status);

-- ============================================================
-- Table: commit_state (optional, GitHub Artifacts 대신 사용 가능)
-- Purpose: 커밋 처리 상태 저장 (증분 업데이트용)
-- ============================================================
CREATE TABLE IF NOT EXISTS commit_state (
  id TEXT PRIMARY KEY,                         -- "owner/repo" 형식
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  last_processed_commit TEXT NOT NULL,         -- 마지막 처리 커밋 SHA
  last_processed_at TIMESTAMPTZ NOT NULL,
  total_commits_processed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(owner, repo)
);

-- Indexes
CREATE INDEX idx_commit_state_owner_repo ON commit_state(owner, repo);
CREATE INDEX idx_commit_state_updated_at ON commit_state(updated_at DESC);

-- Auto-update updated_at trigger
CREATE TRIGGER update_commit_state_updated_at
BEFORE UPDATE ON commit_state
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security (RLS) Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE qa_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ping ENABLE ROW LEVEL SECURITY;
ALTER TABLE commit_state ENABLE ROW LEVEL SECURITY;

-- qa_history: 읽기 전용 (익명 사용자)
CREATE POLICY "qa_history_select_policy"
ON qa_history FOR SELECT
USING (true);

-- qa_history: 삽입 허용 (서비스 역할)
CREATE POLICY "qa_history_insert_policy"
ON qa_history FOR INSERT
WITH CHECK (true);

-- embeddings: 서비스 역할만 전체 접근
CREATE POLICY "embeddings_service_role_policy"
ON embeddings FOR ALL
USING (auth.role() = 'service_role');

-- ping: 서비스 역할만 전체 접근
CREATE POLICY "ping_service_role_policy"
ON ping FOR ALL
USING (auth.role() = 'service_role');

-- commit_state: 서비스 역할만 전체 접근
CREATE POLICY "commit_state_service_role_policy"
ON commit_state FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================
-- Sample Queries (Documentation)
-- ============================================================

-- 1. 벡터 유사도 검색 (Top-K)
/*
SELECT
  id,
  type,
  content,
  metadata,
  1 - (embedding <=> $1::vector) AS similarity
FROM embeddings
WHERE type = 'commit'
ORDER BY embedding <=> $1::vector
LIMIT 10;
*/

-- 2. Q&A 히스토리 조회 (최근 24시간)
/*
SELECT
  created_at,
  question,
  answer,
  category,
  confidence,
  processing_time_ms
FROM qa_history
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
*/

-- 3. Ping 상태 확인 (최근 7일)
/*
SELECT
  created_at,
  status,
  http_code,
  response_time_ms
FROM ping
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
*/

-- 4. 커밋 처리 상태 확인
/*
SELECT
  id,
  owner,
  repo,
  last_processed_commit,
  last_processed_at,
  total_commits_processed
FROM commit_state
ORDER BY updated_at DESC;
*/

-- ============================================================
-- Maintenance Queries
-- ============================================================

-- 1. 오래된 ping 기록 삭제 (90일 이상)
/*
DELETE FROM ping
WHERE created_at < NOW() - INTERVAL '90 days';
*/

-- 2. 임베딩 통계 조회
/*
SELECT
  type,
  COUNT(*) AS count,
  AVG(LENGTH(content)) AS avg_content_length,
  MIN(created_at) AS first_created,
  MAX(created_at) AS last_created
FROM embeddings
GROUP BY type;
*/

-- 3. Q&A 성공률 통계
/*
SELECT
  DATE(created_at) AS date,
  COUNT(*) AS total_questions,
  COUNT(*) FILTER (WHERE status = 'success') AS success_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 2) AS success_rate,
  AVG(processing_time_ms) AS avg_response_time_ms
FROM qa_history
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
*/

-- ============================================================
-- Migration Notes
-- ============================================================
/*
향후 변경 사항:
1. embeddings 테이블의 vector 차원이 변경될 수 있음 (384 → 1536)
   - OpenAI text-embedding-3-small: 1536 dimensions
   - all-MiniLM-L6-v2: 384 dimensions (현재)

2. commit_state 테이블을 GitHub Artifacts 대신 사용할 수 있음
   - Artifacts는 90일 보관 제한
   - Supabase 영구 보관 가능

3. RLS 정책은 프로덕션 요구사항에 따라 조정 필요
*/
