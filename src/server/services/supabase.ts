/**
 * Supabase 클라이언트
 */
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 환경 변수 로드 (이 파일이 import될 때 dotenv.config()가 실행되도록 보장)
dotenv.config();

// Supabase 클라이언트 인스턴스
let supabase: SupabaseClient | null = null;

/**
 * 환경 변수에서 Supabase 설정 가져오기 (지연 평가)
 */
function getSupabaseConfig(): { url: string; key: string } | null {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return null;
    }

    return { url: supabaseUrl, key: supabaseAnonKey };
}

/**
 * Supabase 클라이언트 가져오기
 */
export function getSupabaseClient(): SupabaseClient | null {
    const config = getSupabaseConfig();
    
    if (!config) {
        console.warn('⚠️ Supabase 환경 변수가 설정되지 않았습니다. 이력 저장이 비활성화됩니다.');
        return null;
    }

    if (!supabase) {
        supabase = createClient(config.url, config.key);
    }

    return supabase;
}

/**
 * Supabase 연결 상태 확인
 */
export async function checkSupabaseConnection(): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
        const { error } = await client.from('qa_history').select('id').limit(1);
        return !error;
    } catch {
        return false;
    }
}

// 타입 정의
export interface QAHistoryRecord {
    id?: string;
    question: string;
    question_summary: string;
    answer: string;
    category: 'planning' | 'technical' | 'history' | 'cs' | 'status' | 'unknown';
    category_confidence: number;
    sources: any[];
    status: 'success' | 'partial' | 'failed';
    response_time_ms: number;
    token_usage: number;
    created_at?: string;
}

export interface ServerStatusLog {
    id?: string;
    server_type: 'chromadb' | 'api';
    status: 'online' | 'offline' | 'error';
    message?: string;
    checked_at?: string;
}

/**
 * 질문-응답 이력 저장
 */
export async function saveQAHistory(record: Omit<QAHistoryRecord, 'id' | 'created_at'>): Promise<QAHistoryRecord | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
        const { data, error } = await client
            .from('qa_history')
            .insert(record)
            .select()
            .single();

        if (error) {
            // 테이블이 없으면 자동 마이그레이션 시도
            if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
                console.log('📋 테이블이 없습니다. 자동 마이그레이션을 시도합니다...');
                const { ensureTablesExist } = await import('./supabaseMigration.js');
                const migrated = await ensureTablesExist();
                
                if (migrated) {
                    // 마이그레이션 성공 후 재시도
                    const { data: retryData, error: retryError } = await client
                        .from('qa_history')
                        .insert(record)
                        .select()
                        .single();
                    
                    if (retryError) {
                        console.error('❌ QA 이력 저장 실패 (재시도 후):', retryError.message);
                        return null;
                    }
                    
                    return retryData;
                }
            }
            
            console.error('❌ QA 이력 저장 실패:', error.message);
            return null;
        }

        return data;
    } catch (err) {
        console.error('❌ QA 이력 저장 오류:', err);
        return null;
    }
}

/**
 * 질문-응답 이력 조회
 */
export async function getQAHistory(params?: {
    search?: string;
    category?: string;
    limit?: number;
    offset?: number;
}): Promise<QAHistoryRecord[]> {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
        let query = client
            .from('qa_history')
            .select('*')
            .order('created_at', { ascending: false });

        if (params?.search) {
            query = query.ilike('question', `%${params.search}%`);
        }

        if (params?.category && params.category !== 'all') {
            query = query.eq('category', params.category);
        }

        if (params?.limit) {
            query = query.limit(params.limit);
        }

        if (params?.offset) {
            query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
        }

        const { data, error } = await query;

        if (error) {
            // 테이블이 없으면 자동 마이그레이션 시도
            if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
                console.log('📋 테이블이 없습니다. 자동 마이그레이션을 시도합니다...');
                const { ensureTablesExist } = await import('./supabaseMigration.js');
                await ensureTablesExist();
                // 마이그레이션 후 빈 배열 반환 (테이블이 새로 생성되었으므로 데이터 없음)
                return [];
            }
            
            console.error('❌ QA 이력 조회 실패:', error.message);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('❌ QA 이력 조회 오류:', err);
        return [];
    }
}

/**
 * 특정 QA 이력 조회
 */
export async function getQAHistoryById(id: string): Promise<QAHistoryRecord | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
        const { data, error } = await client
            .from('qa_history')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('❌ QA 이력 조회 실패:', error.message);
            return null;
        }

        return data;
    } catch (err) {
        console.error('❌ QA 이력 조회 오류:', err);
        return null;
    }
}

/**
 * 대시보드 통계 조회
 */
export async function getDashboardStats(): Promise<{
    totalQuestions: number;
    successRate: number;
    failureRate: number;
    averageResponseTimeMs: number;
    todayQuestions: number;
}> {
    const client = getSupabaseClient();
    if (!client) {
        return {
            totalQuestions: 0,
            successRate: 0,
            failureRate: 0,
            averageResponseTimeMs: 0,
            todayQuestions: 0,
        };
    }

    try {
        // 전체 통계
        const { data: allData } = await client
            .from('qa_history')
            .select('status, response_time_ms');

        if (!allData || allData.length === 0) {
            return {
                totalQuestions: 0,
                successRate: 0,
                failureRate: 0,
                averageResponseTimeMs: 0,
                todayQuestions: 0,
            };
        }

        const totalQuestions = allData.length;
        const successCount = allData.filter(r => r.status === 'success').length;
        const failureCount = allData.filter(r => r.status === 'failed').length;
        const avgResponseTime = allData.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / totalQuestions;

        // 오늘 질문 수
        const today = new Date().toISOString().split('T')[0];
        const { count: todayCount } = await client
            .from('qa_history')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today);

        return {
            totalQuestions,
            successRate: (successCount / totalQuestions) * 100,
            failureRate: (failureCount / totalQuestions) * 100,
            averageResponseTimeMs: Math.round(avgResponseTime),
            todayQuestions: todayCount || 0,
        };
    } catch (err) {
        console.error('❌ 대시보드 통계 조회 오류:', err);
        return {
            totalQuestions: 0,
            successRate: 0,
            failureRate: 0,
            averageResponseTimeMs: 0,
            todayQuestions: 0,
        };
    }
}

/**
 * 서버 상태 로그 저장
 */
export async function logServerStatus(log: Omit<ServerStatusLog, 'id' | 'checked_at'>): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    try {
        await client.from('server_status_log').insert(log);
    } catch (err) {
        console.error('❌ 서버 상태 로그 저장 오류:', err);
    }
}

