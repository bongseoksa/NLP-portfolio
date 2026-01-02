# Phase 2 완료: Supabase 하이브리드 모드 구현

**완료 날짜**: 2025-12-31

---

## 📋 완료된 작업

### 1. ✅ runPipeline.ts - Supabase 지원 추가

**파일**: [src/pipeline/runPipeline.ts](src/pipeline/runPipeline.ts)

**주요 변경사항**:
- `useSupabase` 옵션 추가 (`PipelineOptions` 인터페이스)
- 환경 변수 자동 감지 로직 구현
  ```typescript
  const useSupabase = optionUseSupabase ??
      (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) ? true : false;
  ```
- Vector 저장 시 Supabase/ChromaDB 자동 분기
- 콘솔 출력에 사용 중인 Vector Store 표시

**동작**:
```bash
pnpm run dev  # 환경 변수에 따라 자동으로 Supabase 또는 ChromaDB 사용

# 출력 예시:
📊 Vector Store: Supabase (Cloud)  # 또는 ChromaDB (Local)
```

---

### 2. ✅ runPollingPipeline.ts - Supabase 폴링 지원

**파일**: [src/pipeline/runPollingPipeline.ts](src/pipeline/runPollingPipeline.ts)

**주요 변경사항**:
- `RepositoryPollerSupabase` 또는 `RepositoryPoller` 자동 선택
- Commit 상태 업데이트 async/sync 처리 분기
  ```typescript
  if (useSupabase) {
      await (poller as RepositoryPollerSupabase).markAsProcessed(result);
  } else {
      (poller as RepositoryPoller).markAsProcessed(result);
  }
  ```
- Reset 모드 경고 메시지 추가 (Supabase는 수동 삭제 필요)

**동작**:
```bash
pnpm run dev          # 변경 감지 폴링
pnpm run dev --reset  # 전체 재임베딩

# 출력 예시:
📊 Vector Store: Supabase (Cloud)
📊 Commit State: Supabase Table  # 또는 Local File
```

---

### 3. ✅ Server Routes - API 엔드포인트 Supabase 지원

**파일**: [src/server/routes/ask.ts](src/server/routes/ask.ts)

**주요 변경사항**:
- `searchVectorsSupabase` import 추가
- 환경 변수 기반 자동 검색 함수 선택
  ```typescript
  if (useSupabase) {
      contexts = await searchVectorsSupabase(question, 5, {
          filterMetadata: { owner, repo }
      });
  } else {
      contexts = await searchVectors(collectionName, question, 5);
  }
  ```
- 메타데이터 필터링 지원 (owner/repo 자동 필터)
- 콘솔 로그에 사용 중인 Vector Store 표시

**동작**:
```bash
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "프로젝트 설명"}'

# 서버 로그:
🔍 API 질의: "프로젝트 설명" (Supabase Vector Store)
```

---

### 4. ✅ CLI (index.ts) - 명령줄 Supabase 지원

**파일**: [src/index.ts](src/index.ts)

**주요 변경사항**:
- `searchVectorsSupabase` import 추가
- `pnpm run ask` 명령어 Supabase 자동 지원
  ```typescript
  if (useSupabase) {
      context = await searchVectorsSupabase(query, 5, {
          filterMetadata: { owner, repo }
      });
  } else {
      context = await searchVectors(collectionName, query, 5);
  }
  ```
- Vector Store 정보 출력

**동작**:
```bash
pnpm run ask "기술스택 알려줘"

# 출력:
📊 Vector Store: Supabase (Cloud)
❓ Question: 기술스택 알려줘
... 검색 중 (Retrieving contexts) ...
```

---

### 5. ✅ TypeScript 타입 호환성 수정

**파일**: [src/vector_store/searchVectorsSupabase.ts](src/vector_store/searchVectorsSupabase.ts)

**문제**: SearchResult 인터페이스가 ChromaDB와 호환되지 않음
```
Property 'id' is missing in type 'SearchResult'
```

**해결**:
```typescript
// Before
export interface SearchResult {
    content: string;
    metadata: Record<string, any>;
    score: number;
}

// After
export interface SearchResult {
    id: string;  // ← 추가
    content: string;
    metadata: Record<string, any>;
    score: number;
}

// 매핑 로직 수정
const searchResults: SearchResult[] = results.map(result => ({
    id: result.id,  // ← 추가
    content: result.content,
    metadata: result.metadata,
    score: result.similarity
}));
```

**빌드 성공**:
```bash
pnpm run build  # ✅ No errors
```

---

### 6. ✅ 사용자 문서 작성

**파일**: [SUPABASE-USAGE.md](SUPABASE-USAGE.md)

**내용**:
- 빠른 시작 가이드
- 자동 모드 전환 설명
- 명령어 사용법
- 마이그레이션 시나리오 3가지
  1. ChromaDB → Supabase 전환
  2. Supabase → ChromaDB 롤백
  3. A/B 테스트 (두 개 모두 유지)
- 성능 비교표
- 트러블슈팅 가이드
- 고급 설정 (프로그래매틱 모드 선택)
- 보안 참고사항
- 체크리스트

---

## 🎯 핵심 기능

### 1. 자동 모드 전환

환경 변수만으로 Vector Store를 자동 선택:

```bash
# .env 파일
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# 이제 모든 명령어가 자동으로 Supabase 사용
pnpm run dev
pnpm run ask "질문"
pnpm run server
```

환경 변수를 제거하면 자동으로 ChromaDB로 전환!

### 2. 후위 호환성 (Backward Compatibility)

기존 코드 수정 없이 작동:

```typescript
// 기존 코드 그대로 사용 가능
await runPipeline();  // 환경 변수에 따라 자동 선택

// 명시적 지정도 가능
await runPipeline({ useSupabase: true });
```

### 3. 통일된 인터페이스

ChromaDB와 Supabase가 동일한 `SearchResult` 인터페이스 사용:

```typescript
interface SearchResult {
    id: string;
    content: string;
    metadata: Record<string, any>;
    score: number;
}
```

어떤 Vector Store를 사용하든 답변 생성 로직은 동일!

---

## 📊 변경된 파일 요약

| 파일 | 상태 | 주요 변경사항 |
|------|------|-------------|
| [src/pipeline/runPipeline.ts](src/pipeline/runPipeline.ts:34-37) | ✅ Modified | `useSupabase` 옵션, 환경 변수 자동 감지 |
| [src/pipeline/runPollingPipeline.ts](src/pipeline/runPollingPipeline.ts:29) | ✅ Modified | Poller 자동 선택, async/sync 분기 |
| [src/server/routes/ask.ts](src/server/routes/ask.ts:39) | ✅ Modified | 검색 함수 자동 선택, 메타데이터 필터 |
| [src/index.ts](src/index.ts:89) | ✅ Modified | CLI 명령어 Supabase 지원 |
| [src/vector_store/searchVectorsSupabase.ts](src/vector_store/searchVectorsSupabase.ts:5-8) | ✅ Modified | `id` 필드 추가 (타입 호환성) |
| [SUPABASE-USAGE.md](SUPABASE-USAGE.md) | ✅ Created | 사용자 가이드 문서 |
| [PHASE2-SUMMARY.md](PHASE2-SUMMARY.md) | ✅ Created | 이 문서 |

---

## 🚀 사용 방법

### ChromaDB 모드 (기본값)

```bash
# .env에서 SUPABASE_* 환경 변수 없음

pnpm run chroma:start  # ChromaDB 서버 시작
pnpm run dev           # ChromaDB에 저장
pnpm run ask "질문"    # ChromaDB에서 검색
```

### Supabase 모드

```bash
# .env에 추가
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

pnpm run dev          # Supabase에 저장
pnpm run ask "질문"   # Supabase에서 검색
```

ChromaDB 서버 불필요! Serverless 환경에서 바로 실행 가능!

---

## ✅ 검증 완료

### 1. TypeScript 빌드
```bash
pnpm run build  # ✅ 성공 (타입 에러 없음)
```

### 2. 환경 변수 감지
```typescript
// 자동 감지 로직 검증됨
const useSupabase = (process.env.SUPABASE_URL &&
                     process.env.SUPABASE_SERVICE_ROLE_KEY) ? true : false;
```

### 3. 인터페이스 호환성
- `SearchResult` 타입 통일 완료
- ChromaDB와 Supabase 모두 동일한 타입 반환
- 답변 생성 로직 수정 불필요

---

## 🔜 다음 단계 (Phase 3)

현재 구현으로 **로컬 개발**과 **Serverless 배포** 모두 지원 가능합니다.

추가 최적화가 필요한 경우:

1. **GitHub Actions 워크플로우** - Supabase 기반 자동 임베딩
2. **Vercel 배포** - API 서버 Serverless Functions로 전환
3. **성능 모니터링** - Supabase vs ChromaDB 벤치마크
4. **배치 업데이트** - 대량 임베딩 최적화

---

## 📚 관련 문서

- [SUPABASE-USAGE.md](SUPABASE-USAGE.md) - **사용자 가이드 (이 문서부터 읽으세요!)**
- [SERVERLESS-MIGRATION.md](SERVERLESS-MIGRATION.md) - 상세 마이그레이션 가이드
- [SERVERLESS-IMPLEMENTATION-SUMMARY.md](SERVERLESS-IMPLEMENTATION-SUMMARY.md) - Phase 1 구현 요약
- [supabase-schema.sql](supabase-schema.sql) - 데이터베이스 스키마

---

## 🎉 완료!

Phase 2 구현이 완료되었습니다. 이제 환경 변수만 설정하면 ChromaDB와 Supabase를 자유롭게 전환할 수 있습니다!

**핵심**: 코드 수정 없이 환경 변수만으로 Vector Store 전환 가능! 🚀
