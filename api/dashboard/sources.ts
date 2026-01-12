/**
 * Source Contribution Endpoint
 * GET /api/dashboard/sources
 *
 * 데이터 소스별 기여도 통계
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { getSupabaseClient } from '../../shared/lib/supabase.js';

interface SourceContribution {
  type: 'code' | 'commit' | 'history';
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

    // sources 필드 조회
    const { data, error } = await supabase
      .from('qa_history')
      .select('sources');

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // 소스 타입별 카운트
    const sourceCounts: Record<string, number> = {
      code: 0,
      commit: 0,
      history: 0,
    };
    let total = 0;

    for (const record of data || []) {
      const sources = record.sources as Array<{ type?: string }> | null;
      if (sources && Array.isArray(sources)) {
        for (const source of sources) {
          const type = source.type || 'history';
          // file type은 code로 매핑
          const normalizedType = type === 'file' ? 'code' : type;
          if (
            normalizedType in sourceCounts &&
            sourceCounts[normalizedType] !== undefined
          ) {
            sourceCounts[normalizedType] = sourceCounts[normalizedType] + 1;
            total++;
          }
        }
      }
    }

    // 결과 배열 생성
    const result: SourceContribution[] = Object.entries(sourceCounts)
      .map(([type, count]) => ({
        type: type as 'code' | 'commit' | 'history',
        count,
        percentage: total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    res.status(200).json(result);
  } catch (error) {
    console.error('[Dashboard Sources] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch source contribution',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
