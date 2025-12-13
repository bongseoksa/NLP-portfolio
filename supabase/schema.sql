-- Supabase 데이터베이스 스키마
-- 이 파일을 Supabase SQL Editor에서 실행하세요.

-- 질문-응답 이력 테이블
CREATE TABLE IF NOT EXISTS qa_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    question_summary VARCHAR(30) NOT NULL,
    answer TEXT NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('planning', 'technical', 'history', 'cs', 'status', 'unknown')),
    category_confidence FLOAT DEFAULT 0,
    sources JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    response_time_ms INTEGER DEFAULT 0,
    token_usage INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 서버 상태 로그 테이블
CREATE TABLE IF NOT EXISTS server_status_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_type VARCHAR(20) NOT NULL CHECK (server_type IN ('chromadb', 'api')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('online', 'offline', 'error')),
    message TEXT,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_qa_history_created_at ON qa_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_history_category ON qa_history(category);
CREATE INDEX IF NOT EXISTS idx_qa_history_status ON qa_history(status);
CREATE INDEX IF NOT EXISTS idx_server_status_log_checked_at ON server_status_log(checked_at DESC);

-- RLS (Row Level Security) 활성화
ALTER TABLE qa_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_status_log ENABLE ROW LEVEL SECURITY;

-- 모든 사용자에게 읽기 권한 부여 (익명 접근 허용)
CREATE POLICY "Allow anonymous read access to qa_history" 
    ON qa_history FOR SELECT 
    USING (true);

CREATE POLICY "Allow anonymous insert to qa_history" 
    ON qa_history FOR INSERT 
    WITH CHECK (true);

CREATE POLICY "Allow anonymous read access to server_status_log" 
    ON server_status_log FOR SELECT 
    USING (true);

CREATE POLICY "Allow anonymous insert to server_status_log" 
    ON server_status_log FOR INSERT 
    WITH CHECK (true);

