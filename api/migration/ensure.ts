import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { handleError } from '../_lib/errorHandler.js';
import { ensureTablesExist } from '../../src/lib/supabaseMigration.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const success = await ensureTablesExist();
    res.json({
      success,
      message: success ? '모든 테이블이 준비되었습니다.' : '테이블 생성에 실패했습니다.',
    });
  } catch (error) {
    handleError(res, error, 'Table ensure operation failed');
  }
}
