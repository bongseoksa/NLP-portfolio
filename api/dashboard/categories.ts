/**
 * Category Distribution Endpoint
 * GET /api/dashboard/categories
 *
 * 질문 유형별 분포 통계
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { getSupabaseClient } from '../../shared/lib/supabase.js';

interface CategoryDistribution {
  category: string;
  count: number;
  percentage: number;
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

    // 카테고리별 집계 쿼리
    const { data, error } = await supabase
      .from('qa_history')
      .select('category');

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // 카테고리별 카운트 계산
    const categoryCounts: Record<string, number> = {};
    let total = 0;

    for (const record of data || []) {
      const category = record.category || 'etc';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      total++;
    }

    // 결과 배열 생성 (퍼센티지 포함)
    const result: CategoryDistribution[] = Object.entries(categoryCounts)
      .map(([category, count]) => ({
        category,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    res.status(200).json(result);
  } catch (error) {
    console.error('[Dashboard Categories] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch category distribution',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
