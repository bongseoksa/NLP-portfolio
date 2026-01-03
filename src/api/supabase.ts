/**
 * Supabase 클라이언트 (프론트엔드)
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Vite 환경 변수는 import.meta.env를 통해서만 접근 가능
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;

/**
 * Supabase 클라이언트 가져오기
 */
export function getSupabaseClient(): SupabaseClient | null {
    if (!supabaseUrl || !supabaseAnonKey) {
        // 환경 변수가 없을 때는 조용히 처리
        return null;
    }

    if (!supabase) {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
    }

    return supabase;
}

/**
 * Supabase 연결 상태 확인
 */
export async function checkSupabaseConnection(): Promise<boolean> {
    // 환경 변수 확인
    if (!supabaseUrl || !supabaseAnonKey) {
        // 환경 변수가 없을 때는 조용히 처리 (설정 페이지에서 안내)
        return false;
    }

    const client = getSupabaseClient();
    if (!client) {
        return false;
    }

    try {
        const { error } = await client
            .from('qa_history')
            .select('id')
            .limit(1);
        
        if (error) {
            // PGRST205는 테이블이 없다는 의미
            if (error.code === 'PGRST205') {
                // 테이블이 없을 때는 조용히 처리 (설정 페이지에서 안내)
                // console.warn은 한 번만 표시하도록 제거
            } else {
                // 다른 오류는 조용히 로그만 남김
                console.debug('Supabase 연결 오류:', error.message, error.code);
            }
            return false;
        }
        
        return true;
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
        console.error('❌ Supabase 연결 예외:', errorMessage);
        return false;
    }
}

// 타입 정의
export interface QAHistoryRecord {
    id: string;
    question: string;
    question_summary: string;
    answer: string;
    category: 'planning' | 'technical' | 'history' | 'cs' | 'status' | 'unknown';
    category_confidence: number;
    sources: unknown[];
    status: 'success' | 'partial' | 'failed';
    response_time_ms: number;
    token_usage: number;
    created_at: string;
}

/**
 * 질문-응답 이력 조회 (프론트엔드에서 직접 Supabase 접근)
 */
export async function getQAHistoryFromSupabase(params?: {
    search?: string;
    category?: string;
    limit?: number;
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

        const { data, error } = await query;

        if (error) {
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
 * 대시보드 통계 조회
 */
export async function getDashboardStatsFromSupabase(): Promise<{
    totalQuestions: number;
    successRate: number;
    failureRate: number;
    averageResponseTimeMs: number;
}> {
    const client = getSupabaseClient();
    if (!client) {
        return {
            totalQuestions: 0,
            successRate: 0,
            failureRate: 0,
            averageResponseTimeMs: 0,
        };
    }

    try {
        const { data } = await client
            .from('qa_history')
            .select('status, response_time_ms');

        if (!data || data.length === 0) {
            return {
                totalQuestions: 0,
                successRate: 0,
                failureRate: 0,
                averageResponseTimeMs: 0,
            };
        }

        const totalQuestions = data.length;
        const successCount = data.filter(r => r.status === 'success').length;
        const failureCount = data.filter(r => r.status === 'failed').length;
        const avgResponseTime = data.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / totalQuestions;

        return {
            totalQuestions,
            successRate: (successCount / totalQuestions) * 100,
            failureRate: (failureCount / totalQuestions) * 100,
            averageResponseTimeMs: Math.round(avgResponseTime),
        };
    } catch (err) {
        console.error('❌ 대시보드 통계 조회 오류:', err);
        return {
            totalQuestions: 0,
            successRate: 0,
            failureRate: 0,
            averageResponseTimeMs: 0,
        };
    }
}

