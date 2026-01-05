import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from './_lib/cors.js';
import { handleError } from './_lib/errorHandler.js';
import { checkTableExists, initializeTables } from '../shared/lib/supabaseMigration.js';

/**
 * Unified Migration Endpoint
 *
 * GET  /api/migration - Check migration status (compatible with /api/migration/status)
 * POST /api/migration - Run migrations (compatible with /api/migration/run)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(req, res);
  }

  // GET: Check migration status
  if (req.method === 'GET') {
    try {
      const qaHistoryExists = await checkTableExists('qa_history');
      const serverLogExists = await checkTableExists('server_status_log');

      return res.json({
        qa_history: qaHistoryExists,
        server_status_log: serverLogExists,
        allTablesExist: qaHistoryExists && serverLogExists,
      });
    } catch (error) {
      return handleError(res, error, 'Migration status check failed');
    }
  }

  // POST: Run migrations
  if (req.method === 'POST') {
    try {
      const result = await initializeTables();

      if (result.success) {
        return res.json({ success: true, message: result.message });
      } else {
        return res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      return handleError(res, error, 'Migration execution failed');
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
