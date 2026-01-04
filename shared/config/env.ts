/**
 * 환경 변수 관리
 * 
 * .env 파일에는 다음 7개 변수만 포함됩니다:
 * 1. SUPABASE_URL
 * 2. SUPABASE_ANON_KEY
 * 3. SUPABASE_SERVICE_ROLE_KEY
 * 4. CLAUDE_API_KEY
 * 5. GEMINI_API_KEY
 * 6. HUGGING_FACE_API_KEY
 * 7. VECTOR_FILE_URL
 */

/**
 * 필수 환경 변수 검증
 * 서비스 레벨에서 필수적으로 필요한 경우에만 에러를 발생시킵니다.
 */
export function requireEnv(key: string, serviceName: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[${serviceName}] 필수 환경 변수가 누락되었습니다: ${key}\n` +
      `서비스가 정상적으로 작동하려면 .env 파일에 ${key}를 설정해주세요.`
    );
  }
  return value;
}

/**
 * 선택적 환경 변수 (기본값 사용)
 */
export function getEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

/**
 * 환경 변수 타입 안전성
 */
export const env = {
  // Supabase
  SUPABASE_URL: () => getEnv('SUPABASE_URL'),
  SUPABASE_ANON_KEY: () => getEnv('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: () => getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  
  // LLM APIs
  CLAUDE_API_KEY: () => getEnv('CLAUDE_API_KEY'),
  GEMINI_API_KEY: () => getEnv('GEMINI_API_KEY'),
  HUGGING_FACE_API_KEY: () => getEnv('HUGGING_FACE_API_KEY'),
  
  // Vector Storage
  VECTOR_FILE_URL: () => getEnv('VECTOR_FILE_URL', 'output/embeddings.json.gz'),
  
  // Optional (기본값 사용)
  TARGET_REPO_OWNER: () => getEnv('TARGET_REPO_OWNER', ''),
  TARGET_REPO_NAME: () => getEnv('TARGET_REPO_NAME', 'portfolio'),
  NODE_ENV: () => getEnv('NODE_ENV', 'development'),
} as const;

