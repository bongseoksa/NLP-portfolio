/**
 * Shared CORS configuration for all serverless functions
 */
import type { VercelResponse } from '@vercel/node';

export const CORS_HEADERS = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS,POST,PUT,DELETE',
  'Access-Control-Allow-Headers':
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-Type',
};

export function setCorsHeaders(res: VercelResponse): void {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

export function handleOptionsRequest(res: VercelResponse): void {
  setCorsHeaders(res);
  res.status(200).end();
}
