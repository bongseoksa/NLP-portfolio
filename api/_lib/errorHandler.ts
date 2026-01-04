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
  const err = error as any;
  const statusCode = err?.statusCode || 500;
  const message = err?.message || (error as Error)?.message || defaultMessage;
  const errorCode = err?.code || err?.error?.code;

  console.error('API Error:', {
    message,
    statusCode,
    errorCode,
    stack: err?.stack || (error as Error)?.stack,
    details: err?.details || err?.hint,
  });

  // 개발 환경에서는 더 자세한 에러 정보 제공
  const isDevelopment = process.env.NODE_ENV !== 'production';

  res.status(statusCode).json({
    error: defaultMessage,
    message,
    ...(isDevelopment && {
      details: {
        code: errorCode,
        hint: err?.hint,
        details: err?.details,
      },
    }),
  });
}

export function createError(statusCode: number, message: string): ApiError {
  return { statusCode, message, error: message };
}
