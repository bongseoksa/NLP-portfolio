/**
 * Daily Stats Endpoint
 * GET /api/dashboard/daily
 *
 * 일별 질의 통계
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { getSupabaseClient } from '../../shared/lib/supabase.js';

interface DailyStats {
  date: string;
  questionCount: number;
  successCount: number;
  failureCount: number;
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

    // 최근 30일 데이터 조회
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabase
      .from('qa_history')
      .select('created_at, status')
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // 일별 집계
    const dailyMap: Record<
      string,
      { questionCount: number; successCount: number; failureCount: number }
    > = {};

    for (const record of data || []) {
      const date = record.created_at
        ? new Date(record.created_at).toISOString().split('T')[0]
        : null;
      if (!date) continue;

      if (!dailyMap[date]) {
        dailyMap[date] = { questionCount: 0, successCount: 0, failureCount: 0 };
      }

      dailyMap[date].questionCount++;

      if (record.status === 'success' || record.status === null) {
        dailyMap[date].successCount++;
      } else {
        dailyMap[date].failureCount++;
      }
    }

    // 결과 배열 생성 (날짜순 정렬)
    const result: DailyStats[] = Object.entries(dailyMap)
      .map(([date, stats]) => ({
        date,
        ...stats,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.status(200).json(result);
  } catch (error) {
    console.error('[Dashboard Daily] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch daily stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
