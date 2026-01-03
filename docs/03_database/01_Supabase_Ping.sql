-- ============================================================
-- Supabase Ping Table Schema
-- ============================================================
-- Purpose: Supabase Free Tier 7일 비활성 방지
-- Triggered by: GitHub Actions (매주 일요일 24:00 KST)
-- Version: 1.0
-- Last Updated: 2026-01-03
-- ============================================================

-- ============================================================
-- Table: ping
-- ============================================================
CREATE TABLE IF NOT EXISTS ping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,                        -- 'success' | 'error'
  http_code INTEGER,                           -- HTTP 응답 코드 (200, 403, 500 등)
  response_time_ms INTEGER,                    -- 응답 시간 (밀리초)
  error_message TEXT,                          -- 에러 메시지 (있을 경우)
  triggered_by TEXT DEFAULT 'github_actions',  -- 실행 주체

  -- Constraints
  CONSTRAINT ping_status_check CHECK (status IN ('success', 'error'))
);

-- ============================================================
-- Indexes
-- ============================================================
-- 최근 순 조회 최적화
CREATE INDEX IF NOT EXISTS idx_ping_created_at ON ping(created_at DESC);

-- 상태별 필터링
CREATE INDEX IF NOT EXISTS idx_ping_status ON ping(status);

-- 복합 인덱스 (날짜 + 상태)
CREATE INDEX IF NOT EXISTS idx_ping_date_status ON ping(created_at DESC, status);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE ping ENABLE ROW LEVEL SECURITY;

-- 서비스 역할만 전체 접근 가능
CREATE POLICY "ping_service_role_policy"
ON ping FOR ALL
USING (auth.role() = 'service_role');

-- 익명 사용자는 읽기만 가능 (최근 7일)
CREATE POLICY "ping_read_policy"
ON ping FOR SELECT
USING (created_at >= NOW() - INTERVAL '7 days');

-- ============================================================
-- Sample Queries
-- ============================================================

-- 1. 최근 7일 Ping 상태 조회
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

-- 2. 일별 Ping 성공률 집계
/*
SELECT
  DATE(created_at) AS date,
  COUNT(*) AS total_pings,
  COUNT(*) FILTER (WHERE status = 'success') AS success_count,
  COUNT(*) FILTER (WHERE status = 'error') AS error_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 2) AS success_rate,
  AVG(response_time_ms) AS avg_response_time_ms
FROM ping
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
*/

-- 3. 최근 Ping 실패 이력 조회
/*
SELECT
  created_at,
  http_code,
  error_message,
  response_time_ms
FROM ping
WHERE status = 'error'
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
*/

-- 4. 평균 응답 시간 추이 (시간대별)
/*
SELECT
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS ping_count,
  AVG(response_time_ms) AS avg_response_time_ms,
  MIN(response_time_ms) AS min_response_time_ms,
  MAX(response_time_ms) AS max_response_time_ms
FROM ping
WHERE created_at >= NOW() - INTERVAL '24 hours'
  AND status = 'success'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
*/

-- 5. Supabase 연결 상태 체크 (최근 1시간 내 성공 여부)
/*
SELECT
  CASE
    WHEN COUNT(*) FILTER (WHERE status = 'success' AND created_at >= NOW() - INTERVAL '1 hour') > 0
    THEN 'HEALTHY'
    ELSE 'UNHEALTHY'
  END AS supabase_status
FROM ping;
*/

-- ============================================================
-- Maintenance Queries
-- ============================================================

-- 1. 90일 이상 오래된 Ping 기록 삭제
/*
DELETE FROM ping
WHERE created_at < NOW() - INTERVAL '90 days';
*/

-- 2. Ping 테이블 통계 확인
/*
SELECT
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE status = 'success') AS success_count,
  COUNT(*) FILTER (WHERE status = 'error') AS error_count,
  MIN(created_at) AS first_ping,
  MAX(created_at) AS last_ping,
  AVG(response_time_ms) FILTER (WHERE status = 'success') AS avg_response_time_ms,
  pg_size_pretty(pg_total_relation_size('ping')) AS table_size
FROM ping;
*/

-- 3. 중복 Ping 제거 (같은 시간대 중복 기록)
/*
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY DATE_TRUNC('minute', created_at)
      ORDER BY created_at DESC
    ) AS rn
  FROM ping
)
DELETE FROM ping
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
*/

-- ============================================================
-- Automatic Cleanup Function (Optional)
-- ============================================================

-- 90일 이상 오래된 Ping 자동 삭제 함수
CREATE OR REPLACE FUNCTION cleanup_old_pings()
RETURNS void AS $$
BEGIN
  DELETE FROM ping
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Cron Job 설정 (pg_cron extension 필요)
-- 매주 일요일 01:00 UTC에 자동 실행
/*
SELECT cron.schedule(
  'cleanup-old-pings',
  '0 1 * * 0',
  'SELECT cleanup_old_pings();'
);
*/

-- ============================================================
-- Monitoring Alerts (Optional)
-- ============================================================

-- Ping 실패 알림 함수 (Webhook 연동)
CREATE OR REPLACE FUNCTION notify_ping_failure()
RETURNS TRIGGER AS $$
BEGIN
  -- 최근 1시간 내 3회 이상 실패 시 알림
  IF (
    SELECT COUNT(*)
    FROM ping
    WHERE status = 'error'
      AND created_at >= NOW() - INTERVAL '1 hour'
  ) >= 3 THEN
    -- 여기에 Webhook 호출 로직 추가
    RAISE NOTICE 'ALERT: Supabase connection failed 3+ times in the last hour';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger 설정
/*
CREATE TRIGGER ping_failure_alert
AFTER INSERT ON ping
FOR EACH ROW
WHEN (NEW.status = 'error')
EXECUTE FUNCTION notify_ping_failure();
*/

-- ============================================================
-- Sample Data for Testing
-- ============================================================

-- 성공 케이스
/*
INSERT INTO ping (status, http_code, response_time_ms, triggered_by)
VALUES ('success', 200, 120, 'github_actions');
*/

-- 실패 케이스
/*
INSERT INTO ping (status, http_code, response_time_ms, error_message, triggered_by)
VALUES ('error', 500, 5000, 'Connection timeout', 'github_actions');
*/

-- ============================================================
-- Migration Notes
-- ============================================================
/*
1. Supabase Free Tier 7일 비활성 정책
   - 7일 이상 API 요청이 없으면 프로젝트 일시정지
   - ping 테이블은 GitHub Actions로 주기적으로 기록

2. 데이터 보관 정책
   - 기본: 90일 보관
   - 필요 시 cleanup_old_pings() 함수 수동 실행
   - pg_cron 사용 시 자동 정리 가능

3. 모니터링 권장 사항
   - 최근 1시간 내 성공 Ping 확인
   - 연속 실패 시 알림 설정
   - 평균 응답 시간 추이 모니터링
*/
