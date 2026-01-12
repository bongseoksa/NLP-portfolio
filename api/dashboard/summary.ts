/**
 * Dashboard Summary Endpoint
 * GET /api/dashboard/summary
 *
 * 대시보드 요약 통계
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { getSupabaseClient } from '../../shared/lib/supabase.js';

interface DashboardSummary {
  totalQuestions: number;
  successRate: number;
  averageResponseTimeMs: number;
  serverStatus: 'online' | 'offline';
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    handleOptionsRequest(res);
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseClient();

    // 전체 Q&A 기록 조회
    const { data, error } = await supabase
      .from('qa_history')
      .select('status, response_time_ms');

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    const records = data || [];
    const totalQuestions = records.length;

    // 성공률 계산
    const successCount = records.filter(
      (r) => r.status === 'success' || r.status === null
    ).length;
    const successRate =
      totalQuestions > 0 ? (successCount / totalQuestions) * 100 : 0;

    // 평균 응답 시간 계산
    const validResponseTimes = records
      .map((r) => r.response_time_ms)
      .filter((t): t is number => typeof t === 'number' && t > 0);
    const averageResponseTimeMs =
      validResponseTimes.length > 0
        ? Math.round(
            validResponseTimes.reduce((a, b) => a + b, 0) /
              validResponseTimes.length
          )
        : 0;

    const summary: DashboardSummary = {
      totalQuestions,
      successRate: Math.round(successRate * 10) / 10,
      averageResponseTimeMs,
      serverStatus: 'online',
    };

    res.status(200).json(summary);
  } catch (error) {
    console.error('[Dashboard Summary] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard summary',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
