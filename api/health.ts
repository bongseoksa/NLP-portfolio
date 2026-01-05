import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from './_lib/cors.js';
import { handleError } from './_lib/errorHandler.js';
import { checkSupabaseConnection } from './_lib/healthCheck.js';

/**
 * Unified Health Check Endpoint
 *
 * GET /api/health - Basic health check
 * GET /api/health?type=status - Detailed status
 */
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
    const type = req.query.type as string | undefined;

    // Detailed status (compatible with /api/health/status)
    if (type === 'status') {
      return res.json({
        api: {
          status: 'running',
          startedAt: null,
          pid: null,
        },
        supabase: {
          status: supabaseConnected ? 'connected' : 'disconnected',
        },
      });
    }

    // Basic health check (compatible with /api/health)
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
