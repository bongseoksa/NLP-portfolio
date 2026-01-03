# 환경 변수 최적화 가이드

> **문서 버전**: v1.0  
> **최종 업데이트**: 2026-01-03

---

## 개요

서비스 레벨 코드에서 환경 변수 사용을 최적화하여 불필요한 분기 처리를 제거하고, 필수 환경 변수만 명확하게 관리합니다.

---

## 필수 환경 변수 (7개)

`.env` 파일에는 다음 7개 변수만 포함됩니다:

1. `SUPABASE_URL` - Supabase 프로젝트 URL
2. `SUPABASE_ANON_KEY` - Supabase Anon Key (프론트엔드용)
3. `SUPABASE_SERVICE_ROLE_KEY` - Supabase Service Role Key (백엔드용)
4. `CLAUDE_API_KEY` - Claude API 키 (Primary LLM)
5. `GEMINI_API_KEY` - Gemini API 키 (Fallback LLM)
6. `HUGGING_FACE_API_KEY` - Hugging Face API 키 (Fallback LLM)
7. `VECTOR_FILE_URL` - 벡터 파일 URL (기본값: `output/embeddings.json.gz`)

---

## 환경 변수 관리 방식

### 중앙 집중식 관리

모든 환경 변수는 `shared/config/env.ts`에서 중앙 관리됩니다:

```typescript
import { env } from '../config/env.js';

// 사용 예시
const supabaseUrl = env.SUPABASE_URL();
const apiKey = env.CLAUDE_API_KEY();
const vectorFile = env.VECTOR_FILE_URL(); // 기본값 자동 적용
```

### 선택적 환경 변수

대부분의 환경 변수는 **선택적**이며, 없어도 기본값으로 동작합니다:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: 없으면 Supabase 기능 비활성화 (null 반환)
- `CLAUDE_API_KEY`, `GEMINI_API_KEY`, `HUGGING_FACE_API_KEY`: 없으면 해당 LLM 사용 불가 (fallback 체인 작동)
- `VECTOR_FILE_URL`: 없으면 기본값 `output/embeddings.json.gz` 사용
- `TARGET_REPO_OWNER`, `TARGET_REPO_NAME`: 없으면 기본값 사용

### 필수 환경 변수 검증

서비스 레벨에서 **필수적으로 필요한 경우에만** 에러를 발생시킵니다:

```typescript
import { requireEnv } from '../config/env.js';

// Q&A 서비스에서 벡터 파일이 필수인 경우
const vectorFile = requireEnv('VECTOR_FILE_URL', 'Q&A Service');
```

---

## 최적화 원칙

### 1. 불필요한 분기 처리 제거

**Before:**
```typescript
const vectorFileUrl = process.env.VECTOR_FILE_URL;
if (!vectorFileUrl) {
  console.warn('⚠️ Vector file URL not configured');
  return null;
}
```

**After:**
```typescript
const vectorFileUrl = env.VECTOR_FILE_URL(); // 기본값 자동 적용
```

### 2. 선택적 기능은 null 반환

**Before:**
```typescript
const supabaseUrl = process.env.SUPABASE_URL;
if (!supabaseUrl) {
  console.warn('⚠️ Supabase 환경 변수가 설정되지 않았습니다.');
  return null;
}
```

**After:**
```typescript
const supabaseUrl = env.SUPABASE_URL();
if (!supabaseUrl) {
  return null; // 조용히 null 반환 (에러 없음)
}
```

### 3. 필수 환경 변수만 명확한 에러

**Before:**
```typescript
const apiKey = process.env.CLAUDE_API_KEY;
if (!apiKey) {
  throw new Error('CLAUDE_API_KEY is required');
}
```

**After:**
```typescript
const apiKey = requireEnv('CLAUDE_API_KEY', 'Answer Generation Service');
// 명확한 서비스 이름과 함께 에러 메시지 제공
```

---

## 변경된 파일 목록

### 새로 생성된 파일
- `shared/config/env.ts` - 환경 변수 중앙 관리

### 수정된 파일
- `shared/lib/supabase.ts` - env 모듈 사용
- `shared/lib/supabaseMigration.ts` - env 모듈 사용
- `shared/services/qa/answer.ts` - env 모듈 사용
- `shared/services/vector-store/fileVectorStore.ts` - env 모듈 사용
- `shared/services/vector-store/qaHistoryVectorStore.ts` - env 모듈 사용
- `api/ask.ts` - env 모듈 사용, 불필요한 분기 제거
- `api/_lib/healthCheck.ts` - env 모듈 사용

---

## 사용 예시

### 기본 사용 (선택적)

```typescript
import { env } from '../config/env.js';

// 기본값 자동 적용
const vectorFile = env.VECTOR_FILE_URL(); // 'output/embeddings.json.gz'

// 없으면 빈 문자열
const owner = env.TARGET_REPO_OWNER(); // ''

// 없으면 기본값
const repo = env.TARGET_REPO_NAME(); // 'portfolio'
```

### 필수 환경 변수 (에러 발생)

```typescript
import { requireEnv } from '../config/env.js';

// Q&A 서비스에서 벡터 파일이 필수인 경우
try {
  const vectorFile = requireEnv('VECTOR_FILE_URL', 'Q&A Service');
  // ... 벡터 파일 사용
} catch (error) {
  // 명확한 에러 메시지: "[Q&A Service] 필수 환경 변수가 누락되었습니다: VECTOR_FILE_URL"
}
```

---

## 주의사항

1. **스크립트 파일은 제외**: `scripts/` 디렉토리의 파일들은 최적화 대상에서 제외 (직접 `process.env` 사용 가능)

2. **NODE_ENV는 예외**: `NODE_ENV`는 Node.js 표준이므로 직접 사용 가능

3. **기본값 활용**: 대부분의 환경 변수는 기본값을 제공하므로, 없어도 서비스가 정상 작동합니다

---

## 관련 문서

- [환경 변수 설정 가이드](./02_Environment_Variables.md)
- [시스템 아키텍처](./01_System_Architecture.md)

---

**문서 작성 완료**: 2026-01-03

