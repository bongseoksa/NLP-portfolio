-- ============================================================
-- Table: embeddings
-- ============================================================
-- Version: 1.0
-- Last Updated: 2026-01-03
-- Purpose: 임베딩 벡터 임시 저장 (CI 단계 전용)
-- ============================================================

CREATE TABLE IF NOT EXISTS embeddings (
  -- Primary key
  id TEXT PRIMARY KEY,                         -- "commit-{sha}" | "file-{sha}-{index}" | "qa-{id}"

  -- Type classification
  type TEXT NOT NULL,                          -- 'commit' | 'file' | 'qa'

  -- Content and vector
  content TEXT NOT NULL,                       -- 원본 텍스트
  embedding vector(384),                       -- 임베딩 벡터 (all-MiniLM-L6-v2: 384 dimensions)

  -- Metadata (structure varies by type)
  metadata JSONB NOT NULL,                     -- 메타데이터 (type별 구조 다름)

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT embeddings_type_check CHECK (type IN ('commit', 'file', 'qa'))
);

-- ============================================================
-- Indexes
-- ============================================================

-- Type filtering
CREATE INDEX idx_embeddings_type ON embeddings(type);

-- Time-based queries
CREATE INDEX idx_embeddings_created_at ON embeddings(created_at DESC);

-- Vector similarity search index (ivfflat)
-- Note: lists = 100 is suitable for datasets up to 100,000 rows
-- Adjust based on your expected data size
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-update updated_at on row modification
CREATE TRIGGER update_embeddings_updated_at
BEFORE UPDATE ON embeddings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

-- Service role only (CI pipeline access)
CREATE POLICY "embeddings_service_role_policy"
ON embeddings FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================
-- Metadata Schemas (Documentation)
-- ============================================================

/*
Type 1: Commit Embeddings
{
  "type": "commit",
  "sha": "abc123...",
  "author": "username",
  "date": "2024-01-01T00:00:00Z",
  "message": "feat: add feature",
  "fileCount": 5,
  "repository": "owner/repo"
}

Type 2: File Embeddings
{
  "type": "file",
  "path": "src/index.ts",
  "fileType": "src",           // 'src' | 'config' | 'docs' | 'test'
  "size": 1024,
  "extension": ".ts",
  "sha": "def456...",
  "chunkIndex": 0,             // Optional: if file was split
  "totalChunks": 3,            // Optional: total chunks
  "repository": "owner/repo"
}

Type 3: Q&A History Embeddings
{
  "type": "qa",
  "qa_id": "uuid-xxx",
  "category": "technical",
  "created_at": "2024-01-01T00:00:00Z",
  "status": "success"
}
*/

-- ============================================================
-- Sample Queries
-- ============================================================

-- 1. Vector similarity search (Top-K)
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

-- 2. Get all embeddings by type
/*
SELECT
  id,
  content,
  metadata,
  created_at
FROM embeddings
WHERE type = 'file'
ORDER BY created_at DESC;
*/

-- 3. Get embedding statistics
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

-- 4. Search within specific repository
/*
SELECT
  id,
  type,
  content,
  metadata,
  1 - (embedding <=> $1::vector) AS similarity
FROM embeddings
WHERE metadata->>'repository' = 'owner/repo'
ORDER BY embedding <=> $1::vector
LIMIT 10;
*/

-- ============================================================
-- Maintenance Queries
-- ============================================================

-- 1. Delete old Q&A embeddings (older than 90 days)
/*
DELETE FROM embeddings
WHERE type = 'qa'
  AND created_at < NOW() - INTERVAL '90 days';
*/

-- 2. Vacuum after large deletions (reclaim space)
/*
VACUUM ANALYZE embeddings;
*/

-- 3. Rebuild vector index (if performance degrades)
/*
REINDEX INDEX idx_embeddings_vector;
*/

-- ============================================================
-- Performance Notes
-- ============================================================
/*
1. ivfflat index parameters:
   - lists = 100: Good for up to 100K rows
   - lists = 1000: Good for 100K-1M rows
   - lists = 10000: Good for 1M-10M rows

2. Query performance:
   - Cosine similarity: embedding <=> vector
   - L2 distance: embedding <-> vector
   - Inner product: embedding <#> vector

3. Index build time:
   - Requires ANALYZE before creating index
   - Can take 1-10 minutes for 100K rows
   - Disable during bulk inserts, rebuild after

4. Vector search optimization:
   - Use WHERE clauses before ORDER BY
   - Limit results to Top-K (LIMIT 10-50)
   - Consider partitioning by type for large datasets
*/

-- ============================================================
-- Migration Notes
-- ============================================================
/*
Future Changes:
1. Vector dimension may change if embedding model changes:
   - Current: all-MiniLM-L6-v2 (384 dimensions)
   - Potential: OpenAI text-embedding-3-small (1536 dimensions)

   Migration query:
   ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector(1536);
   REINDEX INDEX idx_embeddings_vector;

2. Consider partitioning by type if dataset grows beyond 1M rows:
   CREATE TABLE embeddings_commit PARTITION OF embeddings FOR VALUES IN ('commit');
   CREATE TABLE embeddings_file PARTITION OF embeddings FOR VALUES IN ('file');
   CREATE TABLE embeddings_qa PARTITION OF embeddings FOR VALUES IN ('qa');
*/
