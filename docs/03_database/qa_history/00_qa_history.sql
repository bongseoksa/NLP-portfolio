-- ============================================================
-- Table: qa_history
-- ============================================================
-- Version: 1.1
-- Last Updated: 2026-01-03
-- Purpose: 사용자 질의응답 원문 저장 및 대시보드 통계
-- ============================================================

CREATE TABLE IF NOT EXISTS qa_history (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Question & Answer content
  question TEXT NOT NULL,                     -- 사용자 질문 (전문)
  question_summary TEXT,                      -- 질문 요약 (20자 이내, 대시보드용)
  answer TEXT NOT NULL,                       -- 시스템 응답

  -- Classification
  category TEXT,                              -- 질문 카테고리 (12+ types)
  category_confidence NUMERIC(3, 2),          -- 카테고리 분류 신뢰도 (0.00 ~ 1.00)
  confidence NUMERIC(3, 2),                   -- 전체 응답 신뢰도 (0.00 ~ 1.00, deprecated)

  -- Performance metrics
  response_time_ms INTEGER,                   -- 전체 응답 시간 (밀리초)
  processing_time_ms INTEGER,                 -- 처리 시간 (밀리초, deprecated - use response_time_ms)
  classification_time_ms INTEGER,             -- 카테고리 분류 시간 (밀리초)
  vector_search_time_ms INTEGER,              -- 벡터 검색 시간 (밀리초)
  llm_generation_time_ms INTEGER,             -- LLM 생성 시간 (밀리초)
  db_save_time_ms INTEGER,                    -- DB 저장 시간 (밀리초)

  -- Token usage
  token_usage INTEGER,                        -- 전체 토큰 사용량
  prompt_tokens INTEGER,                      -- 프롬프트 토큰
  completion_tokens INTEGER,                  -- 완성 토큰
  embedding_tokens INTEGER,                   -- 임베딩 토큰

  -- Metadata
  sources JSONB,                              -- 참조한 소스 목록 (code/commit/history)
  metadata JSONB,                             -- 추가 메타데이터
  session_id TEXT,                            -- 대화 세션 ID (연속 대화용)

  -- Status
  status TEXT DEFAULT 'success',              -- 'success' | 'partial' | 'failed'
  llm_provider TEXT,                          -- 사용한 LLM (예: "claude", "gemini", "openai")

  -- Constraints
  CONSTRAINT qa_history_status_check CHECK (status IN ('success', 'partial', 'failed'))
);

-- ============================================================
-- Indexes
-- ============================================================

-- Time-based queries (dashboard daily stats)
CREATE INDEX IF NOT EXISTS idx_qa_history_created_at ON qa_history(created_at DESC);

-- Category filtering (dashboard category distribution)
CREATE INDEX IF NOT EXISTS idx_qa_history_category ON qa_history(category) WHERE category IS NOT NULL;

-- Status filtering (dashboard success rate)
CREATE INDEX IF NOT EXISTS idx_qa_history_status ON qa_history(status);

-- LLM provider analytics
CREATE INDEX IF NOT EXISTS idx_qa_history_llm_provider ON qa_history(llm_provider) WHERE llm_provider IS NOT NULL;

-- Session-based queries (conversation threads)
CREATE INDEX IF NOT EXISTS idx_qa_history_session_id ON qa_history(session_id) WHERE session_id IS NOT NULL;

-- Full-text search (question search)
CREATE INDEX IF NOT EXISTS idx_qa_history_question_fts ON qa_history USING GIN (to_tsvector('english', question));

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE qa_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running this script)
DROP POLICY IF EXISTS "qa_history_select_policy" ON qa_history;
DROP POLICY IF EXISTS "qa_history_insert_policy" ON qa_history;
DROP POLICY IF EXISTS "qa_history_update_policy" ON qa_history;
DROP POLICY IF EXISTS "qa_history_delete_policy" ON qa_history;

-- Allow SELECT for all (anonymous users can read)
CREATE POLICY "qa_history_select_policy"
ON qa_history FOR SELECT
USING (true);

-- Allow INSERT for service role only
CREATE POLICY "qa_history_insert_policy"
ON qa_history FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Allow UPDATE/DELETE for service role only
CREATE POLICY "qa_history_update_policy"
ON qa_history FOR UPDATE
USING (auth.role() = 'service_role');

CREATE POLICY "qa_history_delete_policy"
ON qa_history FOR DELETE
USING (auth.role() = 'service_role');
-- ============================================================
-- Sample Queries
-- ============================================================

-- 1. Dashboard: Daily stats (last 30 days)
/*
SELECT
  DATE(created_at) AS date,
  COUNT(*) AS question_count,
  COUNT(*) FILTER (WHERE status = 'success') AS success_count,
  COUNT(*) FILTER (WHERE status != 'success') AS failure_count,
  AVG(response_time_ms) AS average_response_time_ms
FROM qa_history
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
*/

-- 2. Dashboard: Category distribution
/*
SELECT
  category,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM qa_history
WHERE category IS NOT NULL
GROUP BY category
ORDER BY count DESC;
*/

-- 3. Dashboard: Recent Q&A (last 10)
/*
SELECT
  id,
  question,
  question_summary,
  response_time_ms,
  created_at,
  status
FROM qa_history
ORDER BY created_at DESC
LIMIT 10;
*/

-- 4. Dashboard: Summary statistics
/*
SELECT
  COUNT(*) AS total_questions,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 2) AS success_rate,
  AVG(response_time_ms) AS average_response_time_ms,
  SUM(token_usage) AS total_token_usage
FROM qa_history;
*/

-- 5. Source contribution by type
/*
SELECT
  source_type,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM qa_history,
LATERAL (
  SELECT jsonb_array_elements(sources) -> 'type' AS source_type
) AS s
GROUP BY source_type
ORDER BY count DESC;
*/

-- ============================================================
-- Maintenance Queries
-- ============================================================

-- 1. Delete old Q&A records (older than 6 months)
/*
DELETE FROM qa_history
WHERE created_at < NOW() - INTERVAL '6 months';
*/

-- 2. Update question_summary for NULL entries (first 20 chars)
/*
UPDATE qa_history
SET question_summary = LEFT(question, 20)
WHERE question_summary IS NULL;
*/

-- 3. Analyze table for query optimization
/*
ANALYZE qa_history;
*/

-- 4. Check table size and index usage
/*
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE tablename = 'qa_history';
*/

-- ============================================================
-- Migration Notes
-- ============================================================
/*
Version 1.1 Changes (2026-01-03):
1. Added question_summary field for dashboard display
2. Added detailed timing fields (classification_time_ms, vector_search_time_ms, etc.)
3. Added token usage fields (prompt_tokens, completion_tokens, embedding_tokens)
4. Added session_id for conversation threading
5. Added category_confidence for classification accuracy
6. Deprecated processing_time_ms (use response_time_ms instead)
7. Updated RLS policies to allow service role full access

Backend Compatibility:
- Supports both snake_case (response_time_ms) and camelCase (responseTimeMs) via backend mapping
- Frontend expects camelCase in API responses
- Database uses snake_case convention
*/
