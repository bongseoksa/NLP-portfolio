import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { handleError } from '../_lib/errorHandler.js';
import { getDashboardStats } from '../../src/lib/supabase.js';

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
  } catch (error) {
    handleError(res, error, 'Dashboard stats retrieval failed');
  }
}
