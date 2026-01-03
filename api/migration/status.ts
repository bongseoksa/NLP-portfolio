import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { handleError } from '../_lib/errorHandler.js';
import { checkTableExists } from '../../src/lib/supabaseMigration.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const qaHistoryExists = await checkTableExists('qa_history');
    const serverLogExists = await checkTableExists('server_status_log');

    res.json({
      qa_history: qaHistoryExists,
      server_status_log: serverLogExists,
      allTablesExist: qaHistoryExists && serverLogExists,
    });
  } catch (error) {
    handleError(res, error, 'Migration status check failed');
  }
}
