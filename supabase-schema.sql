-- Supabase Vector Store Schema for NLP Portfolio
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. 벡터 임베딩 테이블
CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-3-small dimension
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 벡터 유사도 검색을 위한 인덱스 (HNSW - 빠른 검색)
CREATE INDEX IF NOT EXISTS embeddings_embedding_idx
  ON embeddings
  USING hnsw (embedding vector_cosine_ops);

-- 3. 메타데이터 검색을 위한 GIN 인덱스
CREATE INDEX IF NOT EXISTS embeddings_metadata_idx
  ON embeddings
  USING gin (metadata);

-- 4. Commit 상태 추적 테이블 (commit-state.json 대체)
CREATE TABLE IF NOT EXISTS commit_states (
  id TEXT PRIMARY KEY,  -- {owner}/{repo}
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  last_processed_commit TEXT NOT NULL,
  last_processed_at TIMESTAMPTZ NOT NULL,
  total_commits_processed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_commit_states_updated_at
  BEFORE UPDATE ON commit_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. 벡터 유사도 검색 함수 (RPC)
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.0,
  match_count int DEFAULT 5,
  filter_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    embeddings.id,
    embeddings.content,
    embeddings.metadata,
    1 - (embeddings.embedding <=> query_embedding) AS similarity
  FROM embeddings
  WHERE
    -- 메타데이터 필터가 있으면 적용
    (filter_metadata = '{}'::jsonb OR embeddings.metadata @> filter_metadata)
  ORDER BY embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 7. Row Level Security (RLS) 활성화
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commit_states ENABLE ROW LEVEL SECURITY;

-- 8. 공개 읽기 정책 (인증된 사용자만 쓰기)
CREATE POLICY "Enable read access for all users" ON embeddings
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON embeddings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Enable update for authenticated users only" ON embeddings
  FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Enable delete for authenticated users only" ON embeddings
  FOR DELETE USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- commit_states 정책
CREATE POLICY "Enable read access for all users" ON commit_states
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON commit_states
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Enable update for authenticated users only" ON commit_states
  FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Enable delete for authenticated users only" ON commit_states
  FOR DELETE USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 9. 컬렉션별 카운트 함수
CREATE OR REPLACE FUNCTION count_embeddings_by_repo(repo_owner text, repo_name text)
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT COUNT(*)
  FROM embeddings
  WHERE metadata->>'owner' = repo_owner
    AND metadata->>'repo' = repo_name;
$$;

-- 10. 임베딩 삭제 함수 (레포지토리 전체)
CREATE OR REPLACE FUNCTION delete_embeddings_by_repo(repo_owner text, repo_name text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM embeddings
  WHERE metadata->>'owner' = repo_owner
    AND metadata->>'repo' = repo_name;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 완료 메시지
DO $$
BEGIN
  RAISE NOTICE 'Supabase Vector Store schema created successfully!';
  RAISE NOTICE 'Tables: embeddings, commit_states';
  RAISE NOTICE 'Functions: match_embeddings, count_embeddings_by_repo, delete_embeddings_by_repo';
END $$;
