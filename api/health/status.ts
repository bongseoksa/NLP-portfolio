import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { handleError } from '../_lib/errorHandler.js';
import { checkSupabaseConnection, checkChromaDBHealth } from '../_lib/healthCheck.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [supabaseConnected, chromadbConnected] = await Promise.all([
      checkSupabaseConnection(),
      checkChromaDBHealth(),
    ]);

    res.json({
      chromadb: {
        status: chromadbConnected ? 'running' : 'stopped',
        startedAt: null,
        pid: null,
      },
      api: {
        status: 'running',
        startedAt: null,
        pid: null,
      },
      supabase: {
        status: supabaseConnected ? 'connected' : 'disconnected',
      },
    });
  } catch (error) {
    handleError(res, error, 'Status check failed');
  }
}
