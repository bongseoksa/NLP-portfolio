/**
 * Supabase 테이블 마이그레이션
 * 테이블이 없을 때 자동으로 생성
 */
import { getSupabaseClient } from './supabase.js';

const SCHEMA_SQL = `
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

-- 기존 정책 삭제 (중복 방지)
DROP POLICY IF EXISTS "Allow anonymous read access to qa_history" ON qa_history;
DROP POLICY IF EXISTS "Allow anonymous insert to qa_history" ON qa_history;
DROP POLICY IF EXISTS "Allow anonymous read access to server_status_log" ON server_status_log;
DROP POLICY IF EXISTS "Allow anonymous insert to server_status_log" ON server_status_log;

-- 모든 사용자에게 읽기/쓰기 권한 부여 (익명 접근 허용)
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
`;

/**
 * 테이블 존재 여부 확인
 */
export async function checkTableExists(tableName: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
        const { error } = await client
            .from(tableName)
            .select('id')
            .limit(1);
        
        // PGRST205는 테이블이 없다는 의미
        if (error && error.code === 'PGRST205') {
            return false;
        }
        
        return !error;
    } catch {
        return false;
    }
}

/**
 * 테이블 초기화 (마이그레이션 실행)
 * 주의: Supabase 클라이언트는 SQL을 직접 실행할 수 없으므로,
 * 이 함수는 Supabase Management API를 사용하거나
 * 사용자에게 SQL Editor에서 실행하도록 안내해야 합니다.
 */
export async function initializeTables(): Promise<{ success: boolean; message: string }> {
    const client = getSupabaseClient();
    if (!client) {
        return {
            success: false,
            message: 'Supabase 클라이언트를 초기화할 수 없습니다.',
        };
    }

    // 테이블 존재 여부 확인
    const qaHistoryExists = await checkTableExists('qa_history');
    const serverLogExists = await checkTableExists('server_status_log');

    if (qaHistoryExists && serverLogExists) {
        return {
            success: true,
            message: '모든 테이블이 이미 존재합니다.',
        };
    }

    // Supabase 클라이언트는 SQL을 직접 실행할 수 없으므로
    // 사용자에게 SQL Editor에서 실행하도록 안내
    return {
        success: false,
        message: `테이블이 없습니다. Supabase SQL Editor에서 다음 스키마를 실행하세요:\n\n${SCHEMA_SQL}`,
    };
}

/**
 * 테이블 스키마 SQL 반환 (사용자 안내용)
 */
export function getSchemaSQL(): string {
    return SCHEMA_SQL;
}

