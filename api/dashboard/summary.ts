import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { getDashboardStats } from '../../shared/lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await getDashboardStats();

    res.json({
      ...stats,
      serverStatus: 'online',
      lastSuccessfulResponse: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Dashboard summary error:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      details: error?.details,
    });
    
    // getDashboardStats는 에러를 throw하지 않고 기본값을 반환하므로,
    // 여기에 도달했다면 예상치 못한 에러
    // 안전하게 기본값 반환
    res.json({
      totalQuestions: 0,
      successRate: 0,
      failureRate: 0,
      averageResponseTimeMs: 0,
      todayQuestions: 0,
      dailyTokenUsage: 0,
      totalTokenUsage: 0,
      serverStatus: 'online',
      lastSuccessfulResponse: new Date().toISOString(),
      warning: 'Statistics temporarily unavailable',
    });
  }
}
