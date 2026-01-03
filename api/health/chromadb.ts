import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { handleError } from '../_lib/errorHandler.js';
import { checkChromaDBHealth } from '../_lib/healthCheck.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const chromadbConnected = await checkChromaDBHealth();

    res.json({
      status: chromadbConnected ? 'online' : 'offline',
      timestamp: new Date().toISOString(),
      service: 'chromadb',
      port: 8000,
    });
  } catch (error) {
    handleError(res, error, 'ChromaDB health check failed');
  }
}
