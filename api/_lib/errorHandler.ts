/**
 * Error Handler
 * API 에러 처리 유틸리티
 */

import type { VercelResponse } from '@vercel/node';

export function handleError(
  res: VercelResponse,
  error: unknown,
  message: string
): void {
  console.error(`[ERROR] ${message}:`, error);

  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const statusCode = getStatusCode(error);

  res.status(statusCode).json({
    error: message,
    details: errorMessage,
    timestamp: new Date().toISOString(),
  });
}

function getStatusCode(error: unknown): number {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('not found')) return 404;
    if (message.includes('unauthorized') || message.includes('api key')) return 401;
    if (message.includes('invalid') || message.includes('required')) return 400;
    if (message.includes('rate limit')) return 429;
  }
  return 500;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
