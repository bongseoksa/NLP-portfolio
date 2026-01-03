import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { handleError } from '../_lib/errorHandler.js';
import { getDailyStats } from '../../shared/lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(res);
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

    res.json(stats);
  } catch (error) {
    handleError(res, error, 'Daily stats retrieval failed');
  }
}
