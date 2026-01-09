/**
 * Health Check Endpoint
 * GET /api/health
 *
 * API 서버 및 벡터 저장소 상태 확인
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { getVectorStats } from '../../shared/services/vector-store/fileVectorStore.js';
import type { HealthStatus } from '../../shared/models/SearchResult.js';

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
    const stats = await getVectorStats();

    const response: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      vectorStore: {
        type: 'file',
        ...stats,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    const response: HealthStatus = {
      status: 'degraded',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    res.status(200).json(response);
  }
}
