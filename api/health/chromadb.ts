/**
 * @deprecated ChromaDB is not used in the architecture.
 * This endpoint is kept for backward compatibility but always returns deprecated status.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ChromaDB is deprecated - always return deprecated status
  res.json({
    status: 'deprecated',
    timestamp: new Date().toISOString(),
    service: 'chromadb',
    message: 'ChromaDB is not used in the architecture. Vector storage uses file-based (GitHub Raw URL) and Supabase pgvector only.',
  });
}
