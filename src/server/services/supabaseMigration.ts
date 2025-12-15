/**
 * Supabase 테이블 마이그레이션
 * 테이블이 없을 때 자동으로 생성
 */
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { getSupabaseClient } from './supabase.js';

dotenv.config();

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
 * Service Role Key를 사용한 Supabase 클라이언트 생성
 */
function getServiceRoleClient(): SupabaseClient | null {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return null;
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

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
        if (error && (error.code === 'PGRST205' || error.message?.includes('does not exist'))) {
            return false;
        }
        
        return !error;
    } catch {
        return false;
    }
}

/**
 * Supabase Management API를 통해 SQL 실행
 * Service Role Key가 필요합니다.
 */
async function executeSQL(sql: string): Promise<{ success: boolean; message: string }> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return {
            success: false,
            message: 'SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. .env 파일에 추가하세요.',
        };
    }

    try {
        // Supabase Management API를 통해 SQL 실행
        // Supabase 프로젝트 ID 추출 (URL에서)
        const projectId = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
        if (!projectId) {
            return {
                success: false,
                message: 'Supabase URL 형식이 올바르지 않습니다.',
            };
        }

        // Management API를 통해 SQL 실행
        // 참고: Supabase Management API는 별도의 엔드포인트를 사용합니다
        const managementUrl = `https://api.supabase.com/v1/projects/${projectId}/database/query`;
        
        const response = await fetch(managementUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ query: sql }),
        });

        if (response.ok) {
            return { success: true, message: '테이블이 성공적으로 생성되었습니다.' };
        }

        const errorText = await response.text();
        return {
            success: false,
            message: `SQL 실행 실패: ${errorText}`,
        };
    } catch (error: any) {
        // Management API가 작동하지 않으면 PostgreSQL 함수를 사용
        // exec_sql 함수가 있는지 확인
        return {
            success: false,
            message: `SQL 실행 오류: ${error.message}. PostgreSQL 함수를 사용하여 재시도합니다.`,
        };
    }
}

/**
 * PostgreSQL 함수를 통해 SQL 실행
 * exec_sql 함수가 먼저 생성되어 있어야 합니다.
 */
async function executeSQLViaFunction(sql: string): Promise<{ success: boolean; message: string }> {
    const serviceRoleClient = getServiceRoleClient();
    if (!serviceRoleClient) {
        return {
            success: false,
            message: 'Service Role Key가 설정되지 않았습니다.',
        };
    }

    try {
        // exec_sql 함수 호출 시도
        const { data, error } = await serviceRoleClient.rpc('exec_sql', { 
            sql_query: sql 
        });

        if (error) {
            // 함수가 없으면 생성해야 함
            if (error.code === 'PGRST204' || error.message?.includes('function') || error.message?.includes('does not exist')) {
                return {
                    success: false,
                    message: 'exec_sql 함수가 없습니다. 먼저 함수를 생성해야 합니다.',
                };
            }
            return {
                success: false,
                message: `SQL 실행 실패: ${error.message}`,
            };
        }

        return { success: true, message: '테이블이 성공적으로 생성되었습니다.' };
    } catch (error: any) {
        return {
            success: false,
            message: `SQL 실행 오류: ${error.message}`,
        };
    }
}

/**
 * 테이블 초기화 (마이그레이션 실행)
 * Service Role Key가 있으면 자동으로 생성 시도
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

    // Service Role Key가 있으면 자동으로 테이블 생성 시도
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) {
        console.log('🔧 Service Role Key가 설정되어 있습니다. 자동 마이그레이션을 시도합니다...');
        
        // 먼저 Management API를 통해 시도
        const managementResult = await executeSQL(SCHEMA_SQL);
        if (managementResult.success) {
            return managementResult;
        }

        // Management API 실패 시 PostgreSQL 함수를 통해 시도
        const functionResult = await executeSQLViaFunction(SCHEMA_SQL);
        if (functionResult.success) {
            return functionResult;
        }

        // 두 방법 모두 실패 시 사용자에게 안내
        console.warn('⚠️ 자동 마이그레이션 실패:', functionResult.message);
    }

    // Service Role Key가 없거나 자동 실행 실패 시 사용자에게 안내
    const setupInstructions = serviceRoleKey 
        ? `\n\n또는 Supabase SQL Editor에서 다음 스키마를 실행하세요:`
        : `\n\nService Role Key를 설정하면 자동으로 테이블을 생성할 수 있습니다.\n또는 Supabase SQL Editor에서 다음 스키마를 실행하세요:`;
    
    return {
        success: false,
        message: `테이블이 없습니다.${setupInstructions}\n\n${SCHEMA_SQL}`,
    };
}

/**
 * 자동 마이그레이션 실행 (테이블이 없을 때 자동으로 호출)
 */
export async function ensureTablesExist(): Promise<boolean> {
    const qaHistoryExists = await checkTableExists('qa_history');
    const serverLogExists = await checkTableExists('server_status_log');

    if (qaHistoryExists && serverLogExists) {
        return true;
    }

    console.log('📋 테이블이 없습니다. 자동 마이그레이션을 시도합니다...');
    const result = await initializeTables();
    
    if (result.success) {
        console.log('✅ 자동 마이그레이션 성공:', result.message);
        return true;
    } else {
        console.warn('⚠️ 자동 마이그레이션 실패:', result.message);
        return false;
    }
}

/**
 * 테이블 스키마 SQL 반환 (사용자 안내용)
 */
export function getSchemaSQL(): string {
    return SCHEMA_SQL;
}

