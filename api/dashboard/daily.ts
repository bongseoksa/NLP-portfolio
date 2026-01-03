import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { getDailyStats } from '../../shared/lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { startDate, endDate } = req.query;

    const stats = await getDailyStats(
      startDate as string | undefined,
      endDate as string | undefined
    );

    res.json(stats || []);
  } catch (error: any) {
    console.error('Dashboard daily error:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    
    // getDailyStats는 에러를 throw하지 않고 빈 배열을 반환하므로,
    // 여기에 도달했다면 예상치 못한 에러
    // 안전하게 빈 배열 반환
    res.json([]);
  }
}
