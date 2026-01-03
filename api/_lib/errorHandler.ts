/**
 * Centralized error handling for serverless functions
 */
import type { VercelResponse } from '@vercel/node';

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

export function handleError(
  res: VercelResponse,
  error: unknown,
  defaultMessage: string = 'Internal server error'
): void {
  console.error('API Error:', error);

  const statusCode = (error as any)?.statusCode || 500;
  const message = (error as Error)?.message || defaultMessage;

  res.status(statusCode).json({
    error: defaultMessage,
    message,
  });
}

export function createError(statusCode: number, message: string): ApiError {
  return { statusCode, message, error: message };
}
