# Vercel Serverless 질문 응답 API 처리 흐름 설계

Vercel Serverless 환경에서 `/api/ask` 엔드포인트의 처리 흐름과 구현 전략을 설명하는 문서입니다.

## 개요

- **엔드포인트**: `POST /api/ask`
- **환경**: Vercel Serverless Functions
- **제약사항**: 실행 시간 60초(Hobby) / 300초(Pro), 메모리 1024MB
- **목표**: 빠른 응답 시간, 안정적인 처리, 비용 효율성

## 1. 전체 처리 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                    POST /api/ask 요청 수신                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ [1] 요청 파싱 및 검증                                            │
│   - question (필수)                                              │
│   - sessionId (선택, 없으면 UUID 생성)                           │
│   - CORS Preflight 처리                                          │
│   - 환경 변수 검증 (VECTOR_FILE_URL)                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ [2] 질문 분류 (Rule-based)                                       │
│   - classifyQuestionWithConfidence()                             │
│   - 카테고리: implementation, structure, history, etc.          │
│   - 신뢰도 점수 반환                                             │
│   ⏱️ 예상 시간: < 10ms                                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ [3] 쿼리 임베딩 생성                                              │
│   - generateQueryEmbedding(question)                             │
│   - OpenAI API 호출 (text-embedding-3-small)                     │
│   - 1536차원 벡터 반환                                           │
│   ⏱️ 예상 시간: 100-300ms                                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ [4] 벡터 파일 로딩 (캐시 우선)                                    │
│   - loadVectorFile()                                             │
│   - CDN에서 embeddings.json.gz 다운로드                          │
│   - gzip 압축 해제                                               │
│   - JSON 파싱                                                    │
│   - 메모리 캐시 저장 (5분 TTL)                                   │
│   ⏱️ Cold Start: 100-300ms, Warm: 10-30ms                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ [5] 코드 + 히스토리 벡터 검색                                     │
│   - searchVectorsFromFile()                                     │
│   ├─ 코드 벡터 검색 (70% 가중치)                                 │
│   │  └─ 인덱스 활용: byType.code                                │
│   ├─ 히스토리 벡터 검색 (30% 가중치)                             │
│   │  └─ 인덱스 활용: bySession, byCategory                       │
│   ├─ 코사인 유사도 계산 (브루트포스)                              │
│   └─ Top-K 추출 및 정렬                                         │
│   ⏱️ 예상 시간: 20-100ms                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ [6] Context 구성                                                 │
│   - buildContext(contexts)                                       │
│   - 검색된 문서들을 프롬프트 형식으로 변환                        │
│   - 메타데이터 포함 (파일 경로, 커밋 해시 등)                     │
│   ⏱️ 예상 시간: < 5ms                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ [7] LLM 답변 생성                                                │
│   - generateAnswerWithUsage(question, contexts)                 │
│   ├─ 1차 시도: OpenAI GPT-4o                                    │
│   │  └─ 실패 시 Claude Sonnet 4로 fallback                      │
│   ├─ 프롬프트 구성: System + Context + Question                 │
│   └─ 토큰 사용량 추적                                           │
│   ⏱️ 예상 시간: 1-5초                                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ [8] 응답 상태 결정                                               │
│   - contexts.length === 0 → 'failed'                            │
│   - contexts.length < 3 → 'partial'                             │
│   - 에러 메시지 포함 → 'failed'                                 │
│   - 그 외 → 'success'                                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ [9] 소스 정보 구성                                               │
│   - contexts → sources 변환                                      │
│   - 타입별 메타데이터 추출 (commit, file, diff)                  │
│   - relevanceScore 포함                                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ [10] 비동기 작업 시작 (Non-blocking)                             │
│   ├─ Supabase 히스토리 저장                                      │
│   │  └─ saveQAHistory()                                         │
│   └─ 히스토리 벡터 추가                                          │
│      └─ addQAHistoryToVectors()                                 │
│      └─ 임베딩 생성 → 메모리 캐시 업데이트                       │
│   ⚠️ 실패해도 API 응답은 정상 반환                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ [11] 클라이언트 응답 반환                                         │
│   - HTTP 200 OK                                                 │
│   - JSON 응답:                                                  │
│     {                                                           │
│       answer: string,                                           │
│       sources: Array,                                           │
│       category: string,                                        │
│       status: 'success' | 'partial' | 'failed',                │
│       timings: {...},                                           │
│       tokens: {...},                                            │
│       sessionId: string                                         │
│     }                                                           │
│   ⏱️ 총 응답 시간: 1-6초                                        │
└─────────────────────────────────────────────────────────────────┘
```

## 2. API 핸들러 의사코드

```typescript
/**
 * Vercel Serverless Function Handler
 * POST /api/ask
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // ============================================================
  // [0] 초기 설정 및 검증
  // ============================================================
  
  // CORS 설정
  setCORSHeaders(res);
  
  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // POST만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const startTime = Date.now();
  
  try {
    // ============================================================
    // [1] 요청 파싱 및 검증
    // ============================================================
    
    const { question, sessionId: clientSessionId } = req.body;
    const sessionId = clientSessionId || generateUUID();
    
    // 입력 검증
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: '질문을 입력해주세요.' });
    }
    
    // 환경 변수 검증
    if (!process.env.VECTOR_FILE_URL) {
      return res.status(500).json({
        error: 'Vector file URL not configured'
      });
    }
    
    // ============================================================
    // [2] 질문 분류 (Rule-based)
    // ============================================================
    
    const classificationStart = Date.now();
    const { category, confidence } = classifyQuestionWithConfidence(question);
    const classificationTime = Date.now() - classificationStart;
    // 예상 시간: < 10ms
    
    // ============================================================
    // [3] 쿼리 임베딩 생성
    // ============================================================
    
    const embeddingStart = Date.now();
    const queryEmbedding = await generateQueryEmbedding(question);
    // OpenAI API 호출: text-embedding-3-small
    // 결과: 1536차원 벡터
    const embeddingTime = Date.now() - embeddingStart;
    // 예상 시간: 100-300ms
    
    // ============================================================
    // [4] 벡터 파일 로딩 (캐시 우선)
    // ============================================================
    
    // 내부적으로 처리됨 (searchVectorsFromFile 내부)
    // - 캐시 확인 (5분 TTL)
    // - 없으면 CDN에서 다운로드
    // - gzip 압축 해제
    // - JSON 파싱
    // - 메모리 캐시 저장
    
    // ============================================================
    // [5] 코드 + 히스토리 벡터 검색
    // ============================================================
    
    const searchStart = Date.now();
    const owner = process.env.TARGET_REPO_OWNER || '';
    const repo = process.env.TARGET_REPO_NAME || 'portfolio';
    
    const contexts = await searchVectorsFromFile(queryEmbedding, 5, {
      threshold: 0.0,
      filterMetadata: { owner, repo },
      includeHistory: true,      // 히스토리 포함
      historyWeight: 0.3,        // 히스토리 30% 가중치
      category                   // 카테고리 기반 검색 모드
    });
    
    // 내부 처리:
    // 1. 코드 벡터 검색 (70%)
    //    - 인덱스 활용: vectorFile.index.byType.code
    //    - 코사인 유사도 계산
    //    - Top-K 추출
    // 2. 히스토리 벡터 검색 (30%)
    //    - 인덱스 활용: historyFile.index.bySession, byCategory
    //    - 코사인 유사도 계산
    //    - Top-K 추출
    // 3. 결과 병합 및 재정렬
    //    - 모든 결과를 유사도 점수로 정렬
    //    - 최종 Top-K 선택
    
    const searchTime = Date.now() - searchStart;
    // 예상 시간: 20-100ms
    
    // ============================================================
    // [6] Context 구성
    // ============================================================
    
    // buildContext() 내부에서 처리됨
    // - 검색된 문서들을 프롬프트 형식으로 변환
    // - 메타데이터 포함 (파일 경로, 커밋 해시 등)
    // 예상 시간: < 5ms
    
    // ============================================================
    // [7] LLM 답변 생성
    // ============================================================
    
    const llmStart = Date.now();
    const { answer, usage } = await generateAnswerWithUsage(question, contexts);
    
    // 내부 처리:
    // 1. Context 텍스트 구성
    // 2. 프롬프트 생성:
    //    - System: 역할 정의
    //    - Context: 검색된 문서들
    //    - Question: 사용자 질문
    // 3. LLM 호출:
    //    - 1차: OpenAI GPT-4o
    //    - 실패 시: Claude Sonnet 4 (fallback)
    // 4. 토큰 사용량 추적
    
    const llmTime = Date.now() - llmStart;
    // 예상 시간: 1-5초
    
    // ============================================================
    // [8] 응답 상태 결정
    // ============================================================
    
    let status: 'success' | 'partial' | 'failed' = 'success';
    
    const isErrorAnswer = answer.includes('오류가 발생') ||
                          answer.includes('관련 정보를 찾을 수 없습니다');
    
    if (contexts.length === 0 || isErrorAnswer) {
      status = 'failed';
    } else if (contexts.length < 3) {
      status = 'partial';
    }
    
    // ============================================================
    // [9] 소스 정보 구성
    // ============================================================
    
    const sources = contexts.map(ctx => {
      const itemType = ctx.metadata?.type || 'commit';
      
      if (itemType === 'file') {
        return {
          type: 'code' as const,
          filePath: ctx.metadata?.path || '',
          commitHash: ctx.metadata?.sha || '',
          relevanceScore: ctx.score || 0
        };
      } else if (itemType === 'diff') {
        return {
          type: 'history' as const,
          filePath: ctx.metadata?.filePath || '',
          commitHash: ctx.metadata?.commitId || '',
          relevanceScore: ctx.score || 0
        };
      } else {
        return {
          type: 'commit' as const,
          commitHash: ctx.metadata?.sha || '',
          commitMessage: ctx.metadata?.message || '',
          filePath: ctx.metadata?.affectedFiles?.[0] || '',
          relevanceScore: ctx.score || 0
        };
      }
    });
    
    // ============================================================
    // [10] 비동기 작업 시작 (Non-blocking)
    // ============================================================
    
    // 히스토리 저장 (실패해도 응답은 정상 반환)
    Promise.all([
      // Supabase에 이력 저장
      saveQAHistory({
        session_id: sessionId,
        question,
        question_summary: truncate(question, 27),
        answer,
        category,
        category_confidence: confidence,
        sources,
        status,
        response_time_ms: Date.now() - startTime,
        token_usage: usage.totalTokens,
        // ... 기타 필드
      }).catch(err => {
        console.warn('⚠️ Supabase 저장 실패:', err.message);
      }),
      
      // 히스토리 벡터 추가
      addQAHistoryToVectors({
        sessionId,
        question,
        answer,
        category,
        categoryConfidence: confidence,
        sources: sources.map(s => s.commitHash || s.filePath || ''),
        status,
        responseTimeMs: Date.now() - startTime,
        tokenUsage: usage.totalTokens,
        owner,
        repo
      }).catch(err => {
        console.warn('⚠️ History vector 추가 실패:', err.message);
      })
    ]).catch(() => {
      // 전체 실패해도 무시 (응답은 이미 반환됨)
    });
    
    // ============================================================
    // [11] 클라이언트 응답 반환
    // ============================================================
    
    const responseTime = Date.now() - startTime;
    
    return res.status(200).json({
      answer,
      sources,
      category,
      categoryConfidence: confidence,
      status,
      responseTimeMs: responseTime,
      tokenUsage: usage.totalTokens,
      sessionId,
      
      timings: {
        classification: classificationTime,
        embedding: embeddingTime,
        vectorSearch: searchTime,
        llmGeneration: llmTime,
        total: responseTime
      },
      
      tokens: {
        prompt: usage.promptTokens,
        completion: usage.completionTokens,
        embedding: 0,  // 쿼리 임베딩은 별도 계산
        total: usage.totalTokens
      }
    });
    
  } catch (error: any) {
    // ============================================================
    // 에러 처리
    // ============================================================
    
    console.error('❌ Serverless 오류:', error.message);
    
    const isTimeout = error.message?.includes('timeout') ||
                     error.code === 'FUNCTION_INVOCATION_TIMEOUT';
    
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'Request timeout' : '답변 생성 중 오류가 발생했습니다.',
      message: error.message
    });
  }
}
```

## 3. Serverless 제한 고려 포인트

### 3.1 실행 시간 제한

**제약사항:**
- Hobby Plan: 최대 60초
- Pro Plan: 최대 300초

**최적화 전략:**

```typescript
// 1. 타임아웃 감지 및 조기 종료
const TIMEOUT_MS = 50000; // 50초 (안전 마진)

const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Request timeout')), TIMEOUT_MS);
});

try {
  const result = await Promise.race([
    processRequest(),
    timeoutPromise
  ]);
} catch (error) {
  // 타임아웃 처리
}

// 2. 단계별 시간 모니터링
const checkTimeRemaining = (startTime: number, maxTime: number) => {
  const elapsed = Date.now() - startTime;
  const remaining = maxTime - elapsed;
  
  if (remaining < 5000) {
    console.warn(`⚠️ 시간 부족: ${remaining}ms 남음`);
    // 간소화된 처리로 전환
  }
};

// 3. 비동기 작업 분리
// 히스토리 저장은 응답 후 처리 (Non-blocking)
Promise.all([
  saveQAHistory(...),
  addQAHistoryToVectors(...)
]).catch(() => {
  // 실패해도 무시
});
```

### 3.2 메모리 제한

**제약사항:**
- 최대 1024MB (Hobby) / 3008MB (Pro)

**최적화 전략:**

```typescript
// 1. 벡터 파일 캐싱 (메모리 재사용)
let cachedVectorFile: VectorFile | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

// 2. 대용량 벡터 세트 처리
// - 인덱스 활용으로 검색 범위 축소
// - 부분 정렬로 메모리 사용량 감소
if (vectors.length > 10000) {
  // 부분 정렬 사용
  return searchWithPartialSort(vectors, queryEmbedding, topK);
}

// 3. 스트리밍 처리 (필요 시)
// 대용량 파일은 청크 단위로 처리
async function loadVectorsInChunks(
  indices: number[],
  chunkSize: number = 1000
): Promise<Vector[]> {
  // 청크 단위 로딩
}

// 4. 불필요한 데이터 제거
// - 검색 후 원본 벡터는 즉시 해제
// - 임시 변수는 스코프 종료 시 자동 GC
```

### 3.3 Cold Start 최소화

**문제:**
- 첫 요청 시 100-500ms 지연
- 벡터 파일 다운로드 시간 포함

**최적화 전략:**

```typescript
// 1. 캐싱 전략
// - Lambda/Vercel 컨테이너 재사용 활용
// - 메모리 캐시로 파일 재로딩 방지
if (cachedVectorFile && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
  return cachedVectorFile; // 캐시 히트
}

// 2. HTTP 캐싱 헤더 활용
const response = await fetch(vectorFileUrl, {
  headers: {
    'If-None-Match': cachedETag  // 304 Not Modified
  }
});

// 3. 핫 패스 최적화
// - 자주 실행되는 코드 최적화
// - 불필요한 초기화 제거
// - Lazy Loading 적용

// 4. 예열 (Warm-up) 전략
// - 주기적으로 함수 호출하여 컨테이너 유지
// - Vercel Cron Jobs 활용
```

### 3.4 동시성 처리

**문제:**
- Serverless는 Stateless
- 파일 업데이트 시 동시성 문제

**해결 전략:**

```typescript
// 1. 이벤트 큐 활용
// 히스토리 벡터 추가는 큐에 넣고 즉시 응답
await enqueueHistoryUpdate({
  sessionId,
  question,
  answer,
  // ...
});

// 2. 버전 기반 업데이트 (Optimistic Locking)
async function updateWithVersion(
  newVectors: QAHistoryVector[],
  expectedVersion: number
) {
  const currentFile = await loadHistoryFile();
  
  if (currentFile.fileVersion !== expectedVersion) {
    // 버전 불일치 → 재시도
    throw new Error('Version mismatch');
  }
  
  // 업데이트
  const updated = {
    ...currentFile,
    fileVersion: currentFile.fileVersion + 1,
    vectors: [...currentFile.vectors, ...newVectors]
  };
  
  await saveHistoryFile(updated);
}

// 3. 배치 처리
// 여러 히스토리를 모아서 한 번에 처리
// - Vercel Queue
// - 별도 배치 함수
```

### 3.5 에러 처리 및 Fallback

**전략:**

```typescript
// 1. 단계별 Fallback
try {
  // 1차: OpenAI
  const answer = await generateWithOpenAI(question, contexts);
} catch (error) {
  // 2차: Claude
  const answer = await generateWithClaude(question, contexts);
} catch (error) {
  // 3차: 기본 응답
  return {
    answer: "죄송합니다. 답변을 생성할 수 없습니다.",
    status: "failed"
  };
}

// 2. 부분 실패 허용
// 히스토리 저장 실패해도 응답은 정상 반환
try {
  await saveQAHistory(...);
} catch (error) {
  console.warn('⚠️ 히스토리 저장 실패:', error);
  // 응답은 계속 진행
}

// 3. 타임아웃 처리
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Timeout')), 50000);
});

try {
  const result = await Promise.race([
    processRequest(),
    timeoutPromise
  ]);
} catch (error) {
  // 타임아웃 시 부분 응답 반환
  return res.status(504).json({
    error: 'Request timeout',
    partialAnswer: partialResult
  });
}
```

### 3.6 비용 최적화

**전략:**

```typescript
// 1. 불필요한 API 호출 최소화
// - 벡터 파일 캐싱
// - ETag 활용 (304 Not Modified)

// 2. 배치 처리
// - 히스토리 벡터 추가는 배치로 처리
// - 여러 요청을 모아서 한 번에 업데이트

// 3. 효율적인 검색
// - 인덱스 활용으로 검색 범위 축소
// - 부분 정렬로 계산량 감소

// 4. 메모리 효율
// - 불필요한 데이터 즉시 해제
// - 스트리밍 처리 (대용량 파일)
```

## 4. 성능 목표

| 단계 | 목표 시간 | 최대 시간 |
|------|-----------|-----------|
| 요청 파싱 | < 5ms | 10ms |
| 질문 분류 | < 10ms | 20ms |
| 임베딩 생성 | 100-300ms | 500ms |
| 벡터 파일 로딩 | 10-300ms | 500ms |
| 벡터 검색 | 20-100ms | 200ms |
| Context 구성 | < 5ms | 10ms |
| LLM 답변 생성 | 1-5초 | 10초 |
| 히스토리 저장 | 비동기 | - |
| **총 응답 시간** | **1-6초** | **15초** |

## 5. 모니터링 포인트

```typescript
// 단계별 시간 측정
const timings = {
  classification: classificationTime,
  embedding: embeddingTime,
  vectorSearch: searchTime,
  llmGeneration: llmTime,
  total: responseTime
};

// 응답에 포함하여 모니터링
res.json({
  // ... 응답 데이터
  timings
});

// 로그 출력
console.log(`📊 단계별 시간:`, timings);
```

## 6. 결론

**핵심 전략:**
1. ✅ **캐싱**: 벡터 파일 메모리 캐싱으로 Cold Start 최소화
2. ✅ **비동기**: 히스토리 저장은 Non-blocking으로 처리
3. ✅ **Fallback**: LLM 실패 시 자동 Fallback
4. ✅ **최적화**: 인덱스 활용으로 검색 범위 축소
5. ✅ **에러 처리**: 부분 실패 허용, 안정적인 응답 보장

**성능 목표 달성:**
- 평균 응답 시간: 1-6초
- Cold Start: 100-300ms
- Warm Start: 10-30ms
- 타임아웃 방지: 50초 안전 마진

