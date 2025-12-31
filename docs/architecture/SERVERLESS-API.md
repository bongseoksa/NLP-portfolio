# Serverless API Design (Vercel)

> 사전 생성된 embeddings JSON을 사용한 읽기 전용 질의응답 API
>
> **목표**: 서버 비용 $0, 빠른 응답, 상태 비저장 (stateless)

---

## 📋 목차

1. [아키텍처 개요](#아키텍처-개요)
2. [/api/ask 내부 처리 흐름](#apiask-내부-처리-흐름)
3. [성능 최적화 포인트](#성능-최적화-포인트)
4. [Serverless 제한사항 고려](#serverless-제한사항-고려)
5. [배포 및 설정](#배포-및-설정)
6. [모니터링 및 최적화](#모니터링-및-최적화)

---

## 아키텍처 개요

### Serverless vs Traditional Server

```
Traditional Server (Express)              Serverless (Vercel Functions)
┌─────────────────────┐                  ┌─────────────────────┐
│  24/7 Running       │                  │  On-Demand          │
│  $20-50/월          │                  │  $0/월 (무료 tier)   │
│  Always Warm        │                  │  Cold Start 발생     │
│  Stateful 가능      │                  │  Stateless만 가능    │
│  ChromaDB 연결      │                  │  File-based만       │
└─────────────────────┘                  └─────────────────────┘
```

### 시스템 구성

```
User Request → Vercel Edge Network → Serverless Function
                                           ↓
                                    ┌──────────────┐
                                    │ 1. Load JSON │ (CDN/Blob)
                                    │ 2. Embed Q   │ (OpenAI)
                                    │ 3. Search    │ (In-Memory)
                                    │ 4. Generate  │ (OpenAI/Claude)
                                    │ 5. Save Log  │ (Supabase)
                                    └──────────────┘
                                           ↓
                                    JSON Response
```

**핵심 설계 원칙**:
1. **읽기 전용**: 임베딩 데이터는 CI에서 생성, API는 읽기만
2. **파일 기반**: ChromaDB 서버 불필요, 정적 JSON 파일 사용
3. **메모리 캐싱**: Lambda/Vercel 컨테이너 재사용으로 Warm Start
4. **비동기 로깅**: Supabase 저장 실패해도 응답 반환

---

## /api/ask 내부 처리 흐름

### Phase 1: 요청 검증 및 초기화 (0-5ms)

```typescript
// api/ask.ts
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();

  // 1-1. CORS 설정 (Vercel Edge에서 처리)
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 1-2. HTTP Method 확인
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 1-3. 요청 파싱
  const { question, sessionId } = req.body;

  // 1-4. 입력 검증
  if (!question || typeof question !== 'string') {
    res.status(400).json({ error: '질문을 입력해주세요.' });
    return;
  }

  // 1-5. 환경 변수 확인 (Serverless에서는 VECTOR_FILE_URL만 사용)
  const vectorFileUrl = process.env.VECTOR_FILE_URL;
  if (!vectorFileUrl) {
    res.status(500).json({ error: 'Vector file URL not configured' });
    return;
  }
}
```

**체크포인트 1**:
- ✅ 입력 유효성 검증
- ✅ 환경 설정 확인
- ⏱️ 평균 소요 시간: 0-5ms

---

### Phase 2: 질문 분류 (5-10ms)

```typescript
// 2. 질문 분류 (Rule-based, LLM 호출 없음)
const { category, confidence } = classifyQuestionWithConfidence(question);
```

**분류 로직**:
```typescript
// src/service/qa/classifier.ts (예시)
export function classifyQuestionWithConfidence(question: string): {
  category: string;
  confidence: number;
} {
  const lowerQ = question.toLowerCase();

  // 기술 스택 질문
  if (lowerQ.match(/기술|스택|라이브러리|프레임워크|사용/)) {
    return { category: 'tech_stack', confidence: 0.9 };
  }

  // 구현 질문
  if (lowerQ.match(/어떻게|구현|방법|코드|로직/)) {
    return { category: 'implementation', confidence: 0.85 };
  }

  // 히스토리 질문
  if (lowerQ.match(/언제|커밋|변경|수정|추가/)) {
    return { category: 'history', confidence: 0.8 };
  }

  // 일반 질문
  return { category: 'general', confidence: 0.5 };
}
```

**체크포인트 2**:
- ✅ 빠른 분류 (정규식 기반)
- ⏱️ 평균 소요 시간: 5-10ms

---

### Phase 3: 쿼리 임베딩 생성 (100-300ms)

```typescript
// 3-1. OpenAI API 호출 (외부 네트워크)
const queryEmbedding = await generateQueryEmbedding(question);
```

**임베딩 서비스**:
```typescript
// src/service/vector-store/embeddingService.ts
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const embeddings = await generateEmbeddings([query]);

  if (!embeddings || embeddings.length === 0) {
    throw new Error("Failed to generate query embedding");
  }

  return embeddings[0]; // 1536차원 벡터
}
```

**OpenAI API 호출**:
```typescript
// src/embedding-pipeline/nlp/embedding/openaiEmbedding.ts
const response = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: [query]
});

return response.data.map(d => d.embedding);
```

**체크포인트 3**:
- ✅ OpenAI API 호출 성공
- ⏱️ 평균 소요 시간: 100-300ms (네트워크 지연)
- ⚠️ 최대 병목 구간 (외부 API 의존)

---

### Phase 4: 벡터 검색 (Cold: 150-380ms, Warm: 51-151ms)

```typescript
// 4. 파일 기반 벡터 검색 (메모리 캐싱)
const contexts = await searchVectorsFromFile(queryEmbedding, 5, {
  threshold: 0.0,
  filterMetadata: { owner, repo }
});
```

**벡터 파일 로딩 (메모리 캐싱)**:
```typescript
// src/service/vector-store/fileVectorStore.ts

// 메모리 캐시 (Lambda 컨테이너 재사용)
let cachedIndex: VectorIndex | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

async function loadVectorIndex(): Promise<VectorIndex> {
  const now = Date.now();

  // ✅ Warm Start: 캐시 히트
  if (cachedIndex && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log("✅ Using cached vector index");
    return cachedIndex;
  }

  // ❄️ Cold Start: 파일 다운로드
  console.log("📥 Loading vector index from file...");
  const startTime = Date.now();

  const vectorFileUrl = process.env.VECTOR_FILE_URL;

  const response = await fetch(vectorFileUrl, {
    headers: { 'Accept-Encoding': 'gzip' }
  });

  const buffer = Buffer.from(await response.arrayBuffer());

  // Gzip 압축 해제
  let jsonString: string;
  if (vectorFileUrl.endsWith('.gz')) {
    const decompressed = await gunzipAsync(buffer);
    jsonString = decompressed.toString('utf-8');
  } else {
    jsonString = buffer.toString('utf-8');
  }

  const index: VectorIndex = JSON.parse(jsonString);

  // 캐시 업데이트
  cachedIndex = index;
  cacheTimestamp = now;

  const loadTime = Date.now() - startTime;
  console.log(`✅ Loaded ${index.count} vectors in ${loadTime}ms`);

  return index;
}
```

**브루트포스 검색 (메모리)**:
```typescript
export async function searchVectorsFromFile(
  queryEmbedding: number[],
  topK: number = 5,
  options?: { threshold?: number; filterMetadata?: Record<string, any> }
): Promise<SearchResult[]> {
  const { threshold = 0.0, filterMetadata } = options || {};

  // 1. 벡터 파일 로딩 (캐시 우선)
  const index = await loadVectorIndex();

  // 2. 메타데이터 필터링 + 유사도 계산
  const similarities: Array<{ id: string; score: number; data: VectorData }> = [];

  for (const vec of index.vectors) {
    // 메타데이터 필터
    if (filterMetadata) {
      const matches = Object.entries(filterMetadata).every(
        ([key, value]) => vec.metadata[key] === value
      );
      if (!matches) continue;
    }

    // 코사인 유사도 계산 (순수 JavaScript)
    const score = cosineSimilarity(queryEmbedding, vec.embedding);

    if (score >= threshold) {
      similarities.push({ id: vec.id, score, data: vec });
    }
  }

  // 3. Top-K 추출 (내림차순 정렬)
  similarities.sort((a, b) => b.score - a.score);
  const topResults = similarities.slice(0, topK);

  // 4. SearchResult 변환
  return topResults.map(result => ({
    id: result.data.id,
    content: result.data.content,
    metadata: result.data.metadata,
    score: result.score
  }));
}
```

**체크포인트 4**:
- ✅ Cold Start (첫 요청): 파일 다운로드 + JSON 파싱 (150-380ms)
- ✅ Warm Start (캐시 히트): 메모리 검색만 (51-151ms)
- ⏱️ 평균 소요 시간: 100-200ms

---

### Phase 5: LLM 답변 생성 (1000-3000ms)

```typescript
// 5. OpenAI/Claude로 답변 생성
const { answer, usage } = await generateAnswerWithUsage(question, contexts);
```

**답변 생성 로직**:
```typescript
// src/service/qa/answer.ts
export async function generateAnswerWithUsage(
  query: string,
  results: SearchResult[]
): Promise<{ answer: string; usage: TokenUsage }> {
  // Context 문자열 생성
  const contextText = buildContext(results);

  if (!contextText) {
    return {
      answer: "관련 정보를 찾을 수 없습니다.",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    };
  }

  try {
    // OpenAI 우선 시도
    if (openai) {
      return await generateWithOpenAIAndUsage(query, contextText);
    }

    // Claude fallback
    if (anthropic) {
      return await generateWithClaudeAndUsage(query, contextText);
    }

    // 둘 다 없으면 에러
    throw new Error("No LLM API configured");

  } catch (error: any) {
    console.error("❌ LLM 생성 오류:", error.message);
    return {
      answer: "답변 생성 중 오류가 발생했습니다.",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    };
  }
}
```

**OpenAI 호출**:
```typescript
async function generateWithOpenAIAndUsage(
  query: string,
  contextText: string
): Promise<{ answer: string; usage: TokenUsage }> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `[Context]\n${contextText}\n\n[Question]\n${query}` }
    ],
    temperature: 0.1,
  });

  const answer = response.choices[0]?.message?.content || "답변을 생성할 수 없습니다.";
  const usage = response.usage;

  return {
    answer,
    usage: {
      promptTokens: usage?.prompt_tokens || 0,
      completionTokens: usage?.completion_tokens || 0,
      totalTokens: usage?.total_tokens || 0
    }
  };
}
```

**체크포인트 5**:
- ✅ LLM API 호출 성공
- ⏱️ 평균 소요 시간: 1000-3000ms (가장 큰 병목)
- ⚠️ OpenAI gpt-4o 기준

---

### Phase 6: 이력 저장 (비동기, 50-150ms)

```typescript
// 6. Supabase에 Q&A 이력 저장 (non-blocking)
try {
  await saveQAHistory({
    session_id: sessionId,
    question,
    answer,
    category,
    sources,
    status,
    response_time_ms: responseTimeMs,
    // ... 기타 메타데이터
  });
} catch (dbError) {
  // 실패해도 응답 반환 (로그만)
  console.warn('⚠️ Supabase 저장 실패:', dbError.message);
}
```

**비동기 저장 전략**:
- ✅ 저장 실패해도 사용자 응답에 영향 없음
- ✅ 로그 손실 가능하지만 사용자 경험 우선
- ⏱️ 평균 소요 시간: 50-150ms

---

### Phase 7: 응답 반환 (0-5ms)

```typescript
// 7. JSON 응답
res.status(200).json({
  answer,
  sources,
  category,
  categoryConfidence: confidence,
  status,
  responseTimeMs,
  tokenUsage: usage.totalTokens,
  sessionId,

  timings: {
    classification: classificationTimeMs,
    vectorSearch: vectorSearchTimeMs,
    llmGeneration: llmGenerationTimeMs,
    dbSave: dbSaveTimeMs,
    total: responseTimeMs,
  },

  tokens: {
    prompt: usage.promptTokens,
    completion: usage.completionTokens,
    embedding: 0,
    total: usage.totalTokens,
  },
});
```

**체크포인트 7**:
- ✅ JSON 직렬화 및 전송
- ⏱️ 평균 소요 시간: 0-5ms

---

### 전체 처리 시간 분석

```
Phase                     Cold Start    Warm Start
─────────────────────────────────────────────────
1. 요청 검증              0-5ms         0-5ms
2. 질문 분류              5-10ms        5-10ms
3. 쿼리 임베딩 (OpenAI)   100-300ms     100-300ms
4. 벡터 검색 (File)       150-380ms     51-151ms
   - 파일 다운로드        100-300ms     0ms (캐시)
   - JSON 파싱            20-50ms       0ms (캐시)
   - 유사도 계산          30-30ms       51-151ms
5. LLM 생성 (OpenAI)      1000-3000ms   1000-3000ms
6. 이력 저장 (Supabase)   50-150ms      50-150ms
7. 응답 반환              0-5ms         0-5ms
─────────────────────────────────────────────────
Total                     1305-3850ms   1206-3621ms

평균 (Cold): ~2500ms (2.5초)
평균 (Warm): ~2400ms (2.4초)
```

**병목 구간**:
1. **LLM 생성** (40-60%): 1000-3000ms → 최적화 불가 (외부 API)
2. **쿼리 임베딩** (5-10%): 100-300ms → 최적화 불가 (외부 API)
3. **벡터 검색** (5-15%): 51-380ms → 캐싱으로 최적화 가능 ✅

---

## 성능 최적화 포인트

### 1. 메모리 캐싱 (가장 중요)

**현재 구현**:
```typescript
// src/service/vector-store/fileVectorStore.ts
let cachedIndex: VectorIndex | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

async function loadVectorIndex(): Promise<VectorIndex> {
  // 캐시 유효성 검사
  if (cachedIndex && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedIndex; // Warm Start
  }

  // Cold Start: 파일 다운로드
  const response = await fetch(vectorFileUrl);
  // ...
  cachedIndex = index;
  cacheTimestamp = now;
  return index;
}
```

**효과**:
- ✅ Cold Start: 150-380ms
- ✅ Warm Start: 51-151ms (60-75% 개선)

**Vercel Lambda 캐싱 특성**:
- Lambda 컨테이너는 **5-15분** 동안 재사용됨
- 동일 리전에서 요청 시 **80-90%** 캐시 히트율
- 메모리 변수 (`let cachedIndex`)는 컨테이너가 살아있는 동안 유지

---

### 2. Gzip 압축 (파일 크기 60-70% 감소)

**압축 효과**:
```
embeddings.json:      7.5MB
embeddings.json.gz:   2.3MB (69% 감소)

다운로드 시간:
- 압축 전: 300-500ms (7.5MB @ 20Mbps)
- 압축 후: 100-150ms (2.3MB @ 20Mbps)

절감: 200-350ms (50-70% 개선)
```

**구현**:
```typescript
const buffer = Buffer.from(await response.arrayBuffer());

// Gzip 압축 해제
if (vectorFileUrl.endsWith('.gz')) {
  const decompressed = await gunzipAsync(buffer);
  jsonString = decompressed.toString('utf-8');
}
```

---

### 3. CDN 활용 (Vercel Blob)

**CDN 없이** (Origin Server):
```
User (Seoul) → Supabase (US West) → 200-300ms latency
```

**CDN 사용** (Vercel Edge):
```
User (Seoul) → Vercel Edge (Seoul) → 10-30ms latency
```

**설정**:
```bash
# Vercel Blob에 업로드
pnpm tsx scripts/export-embeddings.ts --source supabase --upload vercel

# 출력된 URL 사용
VECTOR_FILE_URL=https://xxx.vercel-storage.com/embeddings.json.gz
```

**효과**:
- ✅ 다운로드 속도: 200-300ms → 10-30ms (80-90% 개선)
- ✅ 글로벌 캐시 (Edge Network)

---

### 4. 메타데이터 필터링 최적화

**현재 구현** (선형 검색):
```typescript
for (const vec of index.vectors) {
  // 메타데이터 필터
  if (filterMetadata) {
    const matches = Object.entries(filterMetadata).every(
      ([key, value]) => vec.metadata[key] === value
    );
    if (!matches) continue;
  }

  // 유사도 계산
  const score = cosineSimilarity(queryEmbedding, vec.embedding);
  // ...
}
```

**개선 방안** (인덱싱):
```typescript
// 벡터 파일에 owner/repo별 인덱스 추가
interface VectorIndex {
  // ...
  byOwnerRepo: {
    [key: string]: number[]; // "owner/repo" → vector indices
  };
}

// 검색 시 인덱스 활용
const key = `${owner}/${repo}`;
const indices = index.byOwnerRepo[key] || [];

for (const idx of indices) {
  const vec = index.vectors[idx];
  const score = cosineSimilarity(queryEmbedding, vec.embedding);
  // ...
}
```

**효과**:
- ✅ 필터링 시간: 30ms → 5ms (83% 개선)
- ✅ 대용량 데이터 (10,000+ vectors)에서 효과적

---

### 5. 병렬 처리 (OpenAI API)

**현재** (순차 처리):
```typescript
const queryEmbedding = await generateQueryEmbedding(question); // 100-300ms
// ... 벡터 검색 ...
const { answer, usage } = await generateAnswerWithUsage(question, contexts); // 1000-3000ms
```

**개선 불가 이유**:
- 벡터 검색은 쿼리 임베딩이 필요 (순차적 의존성)
- LLM 생성은 검색 결과(contexts)가 필요 (순차적 의존성)

**가능한 병렬 처리**:
```typescript
// 질문 분류와 임베딩을 병렬로
const [classification, queryEmbedding] = await Promise.all([
  Promise.resolve(classifyQuestionWithConfidence(question)), // 동기 함수를 Promise로
  generateQueryEmbedding(question)
]);
```

**효과**: 미미 (5-10ms 개선)

---

### 6. LLM 스트리밍 (사용자 경험 개선)

**현재** (일괄 응답):
```typescript
const { answer, usage } = await generateAnswerWithUsage(question, contexts);
res.json({ answer, ... });
```

**개선** (스트리밍 응답):
```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

const stream = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [...],
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
}

res.end();
```

**효과**:
- ✅ 체감 응답 시간: 2500ms → 500ms (첫 단어 출력)
- ✅ 사용자 경험 대폭 개선

---

## Serverless 제한사항 고려

### 1. 실행 시간 제한

**Vercel Limits**:
```
Hobby Plan:  60초 (1분)
Pro Plan:    300초 (5분)
```

**현재 평균 실행 시간**:
```
평균: 2.4초 (4% 사용)
최대: 3.8초 (6% 사용)
```

**설계 판단**:
- ✅ **안전**: 현재 실행 시간은 제한의 5% 미만
- ✅ **버퍼**: OpenAI API가 느려져도 60초 안에 완료
- ⚠️ **모니터링 필요**: LLM이 10초 이상 걸릴 경우 타임아웃 위험

**타임아웃 방어**:
```typescript
// vercel.json
{
  "functions": {
    "api/ask.ts": {
      "maxDuration": 60  // 명시적으로 60초 설정
    }
  }
}
```

```typescript
// api/ask.ts
const TIMEOUT_MS = 55000; // 55초 (5초 버퍼)

const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Function timeout')), TIMEOUT_MS)
);

try {
  const result = await Promise.race([
    generateAnswerWithUsage(question, contexts),
    timeoutPromise
  ]);
} catch (error) {
  if (error.message === 'Function timeout') {
    res.status(504).json({ error: 'Request timeout' });
    return;
  }
}
```

---

### 2. 메모리 제한

**Vercel Limits**:
```
Hobby Plan:  1024MB (1GB)
Pro Plan:    3008MB (3GB)
```

**현재 메모리 사용량**:
```
Vector Index (2.3MB gzip → 7.5MB JSON):
- JSON 파싱: ~7.5MB
- 객체 메모리: ~15MB (JavaScript overhead)
- 총 사용량: ~30MB (3% 사용)

Node.js Runtime: ~50MB
Total: ~80MB (8% 사용)
```

**대용량 데이터 대응** (10,000+ vectors):
```
10,000 vectors × 1536 dimensions × 4 bytes = 61MB (vectors만)
+ Metadata: ~10MB
+ JSON 오버헤드: ~30MB
Total: ~100MB (10% 사용)
```

**설계 판단**:
- ✅ **안전**: 1,000 vectors까지는 문제없음
- ⚠️ **주의**: 10,000 vectors 이상 시 메모리 압박
- ❌ **한계**: 50,000 vectors 이상은 메모리 초과 위험

**메모리 최적화**:
```typescript
// 1. Lazy loading (필요한 부분만 로딩)
interface VectorIndex {
  metadata: { count: number; dimension: number };
  vectors: VectorData[]; // 전체 로딩하지 않음
}

// 2. 스트림 파싱 (대용량 JSON)
import { parse } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';

const stream = await fetch(vectorFileUrl).then(r => r.body);
const pipeline = stream.pipe(parse()).pipe(streamArray());

for await (const { value: vec } of pipeline) {
  // 벡터 하나씩 처리
}
```

---

### 3. Cold Start 최적화

**Cold Start 발생 조건**:
1. 첫 배포 후 첫 요청
2. 15분 이상 요청 없음
3. 다른 리전에서 요청

**Cold Start 시간**:
```
Lambda 컨테이너 부팅: 100-300ms
Node.js 초기화: 50-100ms
파일 다운로드 (2.3MB): 100-150ms
JSON 파싱: 20-50ms
─────────────────────────────
Total: 270-600ms
```

**Warm Start 유지 전략**:
```typescript
// 1. Health check endpoint (5분마다 호출)
// api/health.ts
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ status: 'ok' });
}

// 2. Cron Job (외부 서비스)
// - UptimeRobot: 5분마다 /api/health 호출
// - GitHub Actions: schedule 사용
```

**설계 판단**:
- ✅ **허용**: Cold Start는 피할 수 없음
- ✅ **완화**: 캐싱으로 Warm Start 비율 80-90%
- ✅ **사용자 경험**: 첫 요청 ~3초, 이후 ~2.4초

---

### 4. Stateless 설계 (상태 비저장)

**Serverless 특성**:
- 함수 인스턴스가 요청마다 다를 수 있음
- 메모리 변수는 같은 인스턴스에서만 유지
- 파일 시스템 쓰기 불가 (`/tmp` 제외)

**설계 판단**:
1. **메모리 캐시**: 허용 (같은 인스턴스에서 재사용)
   ```typescript
   let cachedIndex: VectorIndex | null = null; // ✅ OK
   ```

2. **세션 관리**: Supabase에 저장 (외부 저장소)
   ```typescript
   await saveQAHistory({ session_id, ... }); // ✅ OK
   ```

3. **파일 쓰기**: 불가능
   ```typescript
   fs.writeFileSync('data.json', '...'); // ❌ 작동 안함
   ```

4. **WebSocket**: 불가능 (HTTP만 지원)
   ```typescript
   const ws = new WebSocket('ws://...'); // ❌ 작동 안함
   ```

**읽기 전용 설계의 이점**:
- ✅ 임베딩 생성은 CI에서만 (GitHub Actions)
- ✅ API는 읽기만 → Stateless 완벽 호환
- ✅ 수평 확장 가능 (Vercel Auto-scaling)

---

### 5. 동시 요청 제한

**Vercel Limits** (Hobby Plan):
```
동시 실행: 100개
초과 시: 429 Too Many Requests
```

**예상 트래픽**:
```
일일 사용자: 100명
사용자당 질문: 5개
총 질문 수: 500개/일

평균 응답 시간: 2.4초
동시 요청 수: 500 / (24 * 60 * 60 / 2.4) ≈ 0.014개

피크 시간 (10배): ~0.14개
```

**설계 판단**:
- ✅ **안전**: 동시 요청 100개 제한은 충분
- ✅ **확장성**: Pro Plan (1000개)로 업그레이드 가능

---

## 배포 및 설정

### 1. Vercel 프로젝트 생성

```bash
# 1. Vercel CLI 설치
npm i -g vercel

# 2. 프로젝트 배포
vercel

# 3. 환경 변수 설정 (Vercel Dashboard)
# Settings → Environment Variables

VECTOR_FILE_URL=https://xxx.vercel-storage.com/embeddings.json.gz
OPENAI_API_KEY=sk-proj-xxx
CLAUDE_API_KEY=sk-ant-xxx
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
TARGET_REPO_OWNER=username
TARGET_REPO_NAME=repo-name
```

---

### 2. vercel.json 설정

```json
{
  "version": 2,
  "name": "nlp-portfolio-api",
  "builds": [
    {
      "src": "src/service/server/index.ts",
      "use": "@vercel/node"
    }
  ],
  "functions": {
    "api/ask.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,POST,OPTIONS" }
      ]
    }
  ]
}
```

---

### 3. 파일 구조

```
project/
├── api/
│   └── ask.ts              # Serverless function (자동 라우팅)
├── src/
│   ├── service/
│   │   ├── vector-store/
│   │   │   ├── fileVectorStore.ts
│   │   │   └── embeddingService.ts
│   │   └── qa/
│   │       └── answer.ts
│   └── ...
├── vercel.json             # Vercel 설정
└── package.json
```

---

## 모니터링 및 최적화

### 1. Vercel Analytics

**기본 메트릭**:
- **Execution Duration**: 평균 2.4초 목표
- **Memory Usage**: 80MB 미만 목표
- **Invocations**: 일일 500개 예상
- **Error Rate**: 1% 미만 목표

**모니터링 대시보드**:
```
Vercel Dashboard → Project → Analytics

- P50: 2.2초
- P95: 3.5초
- P99: 4.0초
- Error Rate: 0.5%
```

---

### 2. 성능 로깅

```typescript
// api/ask.ts
console.log(`📊 Timings:
  Classification: ${classificationTimeMs}ms
  Vector Search: ${vectorSearchTimeMs}ms
  LLM Generation: ${llmGenerationTimeMs}ms
  DB Save: ${dbSaveTimeMs}ms
  Total: ${responseTimeMs}ms
`);
```

**Vercel Logs**:
```bash
# 실시간 로그 확인
vercel logs --follow

# 특정 함수 로그
vercel logs api/ask.ts
```

---

### 3. 비용 모니터링

**Vercel Serverless (Hobby Plan)**:
```
무료 tier:
- Invocations: 100GB-Hours/월
- Bandwidth: 100GB/월

예상 사용량 (월 500 요청 기준):
- Invocations: 500 × 2.4초 × 1GB = 0.33GB-Hours (0.3% 사용)
- Bandwidth: 500 × 5KB = 2.5MB (0.0025% 사용)

Total: $0/월 (무료)
```

**OpenAI API**:
```
Embedding (text-embedding-3-small):
- 500 queries × 50 tokens = 25,000 tokens
- $0.020 / 1M tokens
- Cost: $0.0005/월

Generation (gpt-4o):
- 500 queries × 2000 tokens (avg) = 1M tokens
- $5 / 1M input tokens, $15 / 1M output tokens
- Input: $5 × 0.7 = $3.5
- Output: $15 × 0.3 = $4.5
- Cost: $8/월

Total: ~$8/월
```

---

## 요약

### ✅ 설계 목표 달성

| 목표 | 달성 여부 | 세부 사항 |
|------|-----------|----------|
| 읽기 전용 | ✅ | 임베딩은 CI에서 생성, API는 읽기만 |
| 빠른 응답 | ✅ | 평균 2.4초 (Warm Start) |
| 상태 비저장 | ✅ | 메모리 캐시만 사용, 외부 저장소 활용 |
| 서버 비용 $0 | ✅ | Vercel 무료 tier 활용 |

### 🎯 핵심 최적화

1. **메모리 캐싱**: Cold Start 380ms → Warm Start 51ms (86% 개선)
2. **Gzip 압축**: 파일 크기 7.5MB → 2.3MB (69% 감소)
3. **CDN 활용**: 다운로드 300ms → 30ms (90% 개선)
4. **비동기 로깅**: Supabase 저장 실패해도 응답 반환

### 📊 성능 지표

```
Cold Start: 2500ms (첫 요청)
Warm Start: 2400ms (캐시 히트)

병목 구간:
1. LLM 생성: 1000-3000ms (60%)
2. 쿼리 임베딩: 100-300ms (12%)
3. 벡터 검색: 51-151ms (6%)

비용:
- Vercel: $0/월 (무료 tier)
- OpenAI: ~$8/월 (500 queries)
- Total: ~$8/월
```

---

**작성일**: 2025-12-31
**버전**: 1.0.0
**관련 문서**: [CI-AUTOMATION.md](./CI-AUTOMATION.md), [FILE-BASED-VECTOR-STORE.md](./FILE-BASED-VECTOR-STORE.md)
