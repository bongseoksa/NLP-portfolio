import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { handleError } from '../_lib/errorHandler.js';
import { checkSupabaseConnection } from '../_lib/healthCheck.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseConnected = await checkSupabaseConnection();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        api: 'online',
        supabase: supabaseConnected ? 'connected' : 'disconnected',
      },
    });
  } catch (error) {
    handleError(res, error, 'Health check failed');
  }
}
