import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { handleError } from '../_lib/errorHandler.js';
import { getSchemaSQL } from '../../shared/lib/supabaseMigration.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const schema = getSchemaSQL();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(schema);
  } catch (error) {
    handleError(res, error, 'Schema retrieval failed');
  }
}
