-- ============================================================
-- Table: ping
-- ============================================================
-- Version: 1.0
-- Last Updated: 2026-01-03
-- Purpose: Supabase Free Tier 유지 목적 (GitHub Actions 주간 실행)
-- ============================================================

CREATE TABLE IF NOT EXISTS ping (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Status
  status TEXT NOT NULL,                        -- 'success' | 'error'
  http_code INTEGER,                           -- HTTP 응답 코드
  response_time_ms INTEGER,                    -- 응답 시간 (밀리초)

  -- Error tracking
  error_message TEXT,                          -- 에러 메시지 (있을 경우)

  -- Metadata
  triggered_by TEXT DEFAULT 'github_actions',  -- 실행 주체

  -- Constraints
  CONSTRAINT ping_status_check CHECK (status IN ('success', 'error'))
);

-- ============================================================
-- Indexes
-- ============================================================

-- Time-based queries (recent pings)
CREATE INDEX idx_ping_created_at ON ping(created_at DESC);

-- Status filtering (error detection)
CREATE INDEX idx_ping_status ON ping(status);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE ping ENABLE ROW LEVEL SECURITY;

-- Service role only (GitHub Actions access)
CREATE POLICY "ping_service_role_policy"
ON ping FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================
-- Maintenance Functions
-- ============================================================

-- Automatic cleanup of old ping records (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_pings()
RETURNS void AS $$
BEGIN
  DELETE FROM ping WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Check recent ping health (last 7 days)
CREATE OR REPLACE FUNCTION check_ping_health()
RETURNS TABLE(
  total_pings BIGINT,
  success_count BIGINT,
  error_count BIGINT,
  success_rate NUMERIC,
  avg_response_time_ms NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total_pings,
    COUNT(*) FILTER (WHERE status = 'success') AS success_count,
    COUNT(*) FILTER (WHERE status = 'error') AS error_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 2) AS success_rate,
    ROUND(AVG(response_time_ms), 2) AS avg_response_time_ms
  FROM ping
  WHERE created_at >= NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Sample Queries
-- ============================================================

-- 1. Recent ping status (last 7 days)
/*
SELECT
  created_at,
  status,
  http_code,
  response_time_ms,
  error_message
FROM ping
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
*/

-- 2. Ping health check
/*
SELECT * FROM check_ping_health();
*/

-- 3. Detect consecutive failures (last 3 pings)
/*
SELECT
  created_at,
  status,
  error_message
FROM ping
ORDER BY created_at DESC
LIMIT 3;
*/

-- 4. Average response time trend (daily)
/*
SELECT
  DATE(created_at) AS date,
  COUNT(*) AS ping_count,
  AVG(response_time_ms) AS avg_response_time_ms,
  MAX(response_time_ms) AS max_response_time_ms
FROM ping
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
*/

-- ============================================================
-- Monitoring Alerts
-- ============================================================

-- Alert: Check if last ping was more than 8 days ago (Free Tier expires in 7 days)
/*
SELECT
  CASE
    WHEN MAX(created_at) < NOW() - INTERVAL '8 days' THEN
      'CRITICAL: No ping in 8+ days. Supabase may be paused.'
    WHEN MAX(created_at) < NOW() - INTERVAL '6 days' THEN
      'WARNING: No ping in 6+ days. Ping scheduled soon.'
    ELSE
      'OK: Recent ping detected.'
  END AS alert_status,
  MAX(created_at) AS last_ping_time
FROM ping;
*/

-- Alert: Check if recent pings are failing
/*
SELECT
  CASE
    WHEN COUNT(*) FILTER (WHERE status = 'error') >= 3 THEN
      'CRITICAL: 3+ consecutive ping failures detected.'
    WHEN COUNT(*) FILTER (WHERE status = 'error') >= 1 THEN
      'WARNING: Recent ping failure detected.'
    ELSE
      'OK: All recent pings successful.'
  END AS alert_status,
  COUNT(*) FILTER (WHERE status = 'error') AS failure_count
FROM (
  SELECT status FROM ping ORDER BY created_at DESC LIMIT 5
) AS recent_pings;
*/

-- ============================================================
-- Maintenance Queries
-- ============================================================

-- 1. Cleanup old pings (manual execution)
/*
SELECT cleanup_old_pings();
*/

-- 2. Get ping statistics
/*
SELECT
  COUNT(*) AS total_pings,
  MIN(created_at) AS first_ping,
  MAX(created_at) AS last_ping,
  COUNT(*) FILTER (WHERE status = 'success') AS success_count,
  COUNT(*) FILTER (WHERE status = 'error') AS error_count,
  AVG(response_time_ms) AS avg_response_time_ms
FROM ping;
*/

-- ============================================================
-- Scheduled Jobs (Supabase pg_cron)
-- ============================================================

/*
-- Option: Schedule automatic cleanup (requires pg_cron extension)
SELECT cron.schedule(
  'cleanup-old-pings',          -- Job name
  '0 0 * * 0',                  -- Every Sunday at midnight
  $$SELECT cleanup_old_pings()$$
);
*/

-- ============================================================
-- Migration Notes
-- ============================================================
/*
Purpose:
- Supabase Free Tier pauses projects after 7 days of inactivity
- GitHub Actions workflow runs weekly to prevent this
- This table logs each ping attempt for monitoring

Workflow:
- Schedule: Every Sunday 24:00 KST (UTC 15:00)
- GitHub Actions: .github/workflows/supabase-ping.yml
- Success: HTTP 200-299 response from Supabase REST API
- Failure: HTTP 4xx/5xx or network error

Monitoring:
- Check last ping: SELECT MAX(created_at) FROM ping;
- Check failures: SELECT * FROM ping WHERE status = 'error' ORDER BY created_at DESC LIMIT 10;
- Cleanup: Automatically delete pings older than 90 days
*/
