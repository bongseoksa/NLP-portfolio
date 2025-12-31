-- qa_history 테이블에 session_id 컬럼 추가
ALTER TABLE qa_history ADD COLUMN IF NOT EXISTS session_id VARCHAR(36);

-- session_id 인덱스 추가 (세션별 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_qa_history_session_id ON qa_history(session_id);

-- session_id와 created_at 복합 인덱스 (세션 내 시간순 정렬용)
CREATE INDEX IF NOT EXISTS idx_qa_history_session_created ON qa_history(session_id, created_at);
