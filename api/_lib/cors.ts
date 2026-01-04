/**
 * Shared CORS configuration for all serverless functions
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// 허용된 Origin 목록
const ALLOWED_ORIGINS = [
  'http://localhost:5173',  // Vite dev server
  'http://localhost:3000',   // 일반적인 React dev server
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

/**
 * 요청의 Origin이 허용된 목록에 있는지 확인
 */
function getAllowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  
  // 개발 환경에서는 localhost 허용
  if (ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  
  // 프로덕션 환경에서는 환경 변수로 설정된 Origin 허용
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin && origin === allowedOrigin) {
    return origin;
  }
  
  return null;
}

/**
 * CORS 헤더 설정
 * credentials를 사용할 때는 '*' 대신 특정 origin을 설정해야 함
 */
export function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin;
  const allowedOrigin = getAllowedOrigin(origin);
  
  // Origin이 허용된 경우에만 credentials 허용
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  } else {
    // Origin이 없거나 허용되지 않은 경우 '*' 사용 (credentials 없이)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-Type, Authorization'
  );
  res.setHeader('Access-Control-Max-Age', '86400'); // 24시간
}

export function handleOptionsRequest(req: VercelRequest, res: VercelResponse): void {
  setCorsHeaders(req, res);
  res.status(200).end();
}
