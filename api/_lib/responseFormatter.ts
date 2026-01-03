/**
 * Consistent response formatting
 */
import type { VercelResponse } from '@vercel/node';

export function sendJson<T>(
  res: VercelResponse,
  data: T,
  statusCode: number = 200
): void {
  res.status(statusCode).json(data);
}

export function sendText(
  res: VercelResponse,
  text: string,
  contentType: string = 'text/plain; charset=utf-8'
): void {
  res.setHeader('Content-Type', contentType);
  res.send(text);
}
