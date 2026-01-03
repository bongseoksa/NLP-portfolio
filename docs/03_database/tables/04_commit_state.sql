-- ============================================================
-- Table: commit_state
-- ============================================================
-- Version: 1.0
-- Last Updated: 2026-01-03
-- Purpose: 커밋 처리 상태 저장 (증분 업데이트용)
-- ============================================================

CREATE TABLE IF NOT EXISTS commit_state (
  -- Primary key
  id TEXT PRIMARY KEY,                         -- "owner/repo" 형식

  -- Repository identification
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',

  -- Processing state
  last_processed_commit TEXT NOT NULL,         -- 마지막 처리 커밋 SHA
  last_processed_at TIMESTAMPTZ NOT NULL,
  total_commits_processed INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(owner, repo)
);

-- ============================================================
-- Indexes
-- ============================================================

-- Query by owner/repo combination
CREATE INDEX idx_commit_state_owner_repo ON commit_state(owner, repo);

-- Time-based queries
CREATE INDEX idx_commit_state_updated_at ON commit_state(updated_at DESC);

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-update updated_at on row modification
CREATE TRIGGER update_commit_state_updated_at
BEFORE UPDATE ON commit_state
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE commit_state ENABLE ROW LEVEL SECURITY;

-- Service role only (CI pipeline access)
CREATE POLICY "commit_state_service_role_policy"
ON commit_state FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================
-- Sample Queries
-- ============================================================

-- 1. Get processing state for all repositories
/*
SELECT
  id,
  owner,
  repo,
  default_branch,
  last_processed_commit,
  last_processed_at,
  total_commits_processed,
  updated_at
FROM commit_state
ORDER BY updated_at DESC;
*/

-- 2. Get state for specific repository
/*
SELECT
  last_processed_commit,
  last_processed_at,
  total_commits_processed
FROM commit_state
WHERE owner = 'username' AND repo = 'repo-name';
*/

-- 3. Upsert commit state (after processing)
/*
INSERT INTO commit_state (
  id,
  owner,
  repo,
  default_branch,
  last_processed_commit,
  last_processed_at,
  total_commits_processed
) VALUES (
  'owner/repo',
  'owner',
  'repo',
  'main',
  'abc123...',
  NOW(),
  150
)
ON CONFLICT (owner, repo)
DO UPDATE SET
  last_processed_commit = EXCLUDED.last_processed_commit,
  last_processed_at = EXCLUDED.last_processed_at,
  total_commits_processed = EXCLUDED.total_commits_processed;
*/

-- 4. Check repositories needing update (not processed in 7+ days)
/*
SELECT
  id,
  owner,
  repo,
  last_processed_at,
  NOW() - last_processed_at AS time_since_update
FROM commit_state
WHERE last_processed_at < NOW() - INTERVAL '7 days'
ORDER BY last_processed_at ASC;
*/

-- ============================================================
-- Maintenance Queries
-- ============================================================

-- 1. Reset commit state for repository (full reindex)
/*
UPDATE commit_state
SET
  last_processed_commit = '',
  total_commits_processed = 0,
  last_processed_at = NOW()
WHERE owner = 'owner' AND repo = 'repo';
*/

-- 2. Delete commit state for repository
/*
DELETE FROM commit_state
WHERE owner = 'owner' AND repo = 'repo';
*/

-- ============================================================
-- Migration Notes
-- ============================================================
/*
Purpose:
- Track last processed commit SHA for each repository
- Enable incremental updates (only process new commits)
- Avoid re-processing entire commit history on every CI run

Alternative:
- GitHub Artifacts (commit-state.json): 90-day retention limit
- Supabase commit_state table: Permanent storage

Workflow:
1. CI Pipeline starts
2. Query commit_state table for last_processed_commit
3. Fetch only new commits since last_processed_commit
4. Generate embeddings for new commits
5. Update commit_state with latest commit SHA

Idempotency:
- Pipeline can be run multiple times safely
- Re-processing same commit will overwrite existing embeddings
- commit_state ensures we don't process old commits repeatedly

Usage in CI:
- Read: SELECT last_processed_commit FROM commit_state WHERE id = 'owner/repo'
- Write: UPSERT commit_state after successful embedding generation
*/
