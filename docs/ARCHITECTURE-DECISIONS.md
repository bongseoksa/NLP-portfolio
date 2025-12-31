# Architecture Decision Records (ADR)

> 면접 대비 아키텍처 결정 사항 정리
>
> **프로젝트**: GitHub Repository NLP Analyzer (Q&A System)

---

## 📋 목차

1. [왜 WebSocket을 제거했는가](#1-왜-websocket을-제거했는가)
2. [왜 ChromaDB 서버를 쓰지 않았는가](#2-왜-chromadb-서버를-쓰지-않았는가)
3. [왜 임베딩을 CI에서 수행하는가](#3-왜-임베딩을-ci에서-수행하는가)
4. [서버 비용을 어떻게 0원으로 유지했는가](#4-서버-비용을-어떻게-0원으로-유지했는가)
5. [왜 Supabase를 병행하는가](#5-왜-supabase를-병행하는가)
6. [왜 증분 업데이트를 구현했는가](#6-왜-증분-업데이트를-구현했는가)
7. [왜 파일 기반 벡터 스토어를 선택했는가](#7-왜-파일-기반-벡터-스토어를-선택했는가)

---

## 1. 왜 WebSocket을 제거했는가?

### 핵심 답변

> **"Serverless 환경에서는 WebSocket이 지원되지 않고, HTTP/2 Server-Sent Events로 충분하며, 실시간 양방향 통신이 불필요했기 때문입니다."**

---

### 상세 설명

#### Context (배경)
- 초기 설계에서는 LLM 스트리밍 응답을 위해 WebSocket 사용 고려
- ChatGPT처럼 답변이 점진적으로 출력되는 UX 구현 목표

#### Problem (문제점)
1. **Vercel Serverless 제약**: WebSocket 미지원
   - Vercel Functions는 HTTP 요청/응답만 지원
   - WebSocket은 persistent connection 필요 (Serverless와 철학적 불일치)

2. **비용 증가**: WebSocket 서버 별도 운영 필요
   - Vercel에서 WebSocket 사용 시 별도 서버 필요 ($20-50/월)
   - Socket.io 서버 운영 오버헤드

3. **복잡도 증가**:
   - WebSocket 연결 관리 (reconnection, heartbeat)
   - 클라이언트-서버 양방향 통신 로직
   - CORS, 인증 등 추가 설정

#### Decision (결정)
**HTTP/2 Server-Sent Events (SSE) 사용**

```typescript
// OpenAI Streaming API
const stream = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [...],
  stream: true,  // SSE 스트리밍
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  // HTTP response stream으로 전송
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
}
```

#### Consequences (결과)
**장점**:
- ✅ Serverless 완벽 호환
- ✅ 서버 비용 0원 유지
- ✅ OpenAI API가 네이티브로 SSE 지원
- ✅ 단방향 스트리밍으로 충분 (서버 → 클라이언트만)

**단점**:
- ⚠️ 양방향 통신 불가 (하지만 Q&A에서는 불필요)
- ⚠️ 브라우저 지원 제약 (하지만 모던 브라우저는 모두 지원)

#### Alternatives (대안)
1. **WebSocket + 별도 서버**: 비용 증가 ($20-50/월), 복잡도 증가
2. **Long Polling**: 비효율적, 네트워크 오버헤드 큼
3. **일괄 응답**: 사용자 경험 저하 (2-3초 대기)

---

### 면접 답변 (30초)

> "초기에는 실시간 스트리밍을 위해 WebSocket을 고려했지만, Vercel Serverless 환경에서는 WebSocket이 지원되지 않아 제거했습니다. 대신 OpenAI API가 네이티브로 제공하는 SSE(Server-Sent Events)를 사용했고, Q&A 시스템에서는 서버에서 클라이언트로 단방향 스트리밍만 필요하므로 SSE로 충분했습니다. 이를 통해 별도 WebSocket 서버 없이도 실시간 답변 출력 UX를 구현하면서 서버 비용 0원을 유지할 수 있었습니다."

---

## 2. 왜 ChromaDB 서버를 쓰지 않았는가?

### 핵심 답변

> **"ChromaDB는 24/7 서버 운영이 필요해 월 $20-50 비용이 발생하지만, 읽기 전용 Q&A 시스템에서는 정적 JSON 파일로 충분하고 Serverless 환경과 철학적으로 맞지 않았기 때문입니다."**

---

### 상세 설명

#### Context (배경)
- ChromaDB: Python 기반 벡터 데이터베이스 (Chroma 서버 필요)
- 로컬 개발 시에는 ChromaDB 사용 (`pnpm run chroma:start`)

#### Problem (문제점)
1. **서버 비용**: ChromaDB 서버 24/7 운영 필요
   - Docker 컨테이너 호스팅: $20-50/월 (DigitalOcean, AWS ECS 등)
   - Chroma Cloud: $30-100/월

2. **Serverless 불일치**:
   - ChromaDB는 stateful 서버 (persistent connection 필요)
   - Vercel Serverless는 stateless (요청마다 독립적)
   - Lambda에서 ChromaDB 서버 연결 불가능

3. **읽기 전용 특성**:
   - Q&A API는 벡터 검색만 수행 (쓰기 없음)
   - 임베딩 생성은 CI에서만 발생
   - 24/7 서버 운영은 오버스펙

#### Decision (결정)
**파일 기반 벡터 스토어 (File-based Vector Store)**

```typescript
// fileVectorStore.ts
let cachedIndex: VectorIndex | null = null; // 메모리 캐싱

async function loadVectorIndex(): Promise<VectorIndex> {
  if (cachedIndex) return cachedIndex; // Warm Start

  // CDN에서 JSON 파일 다운로드
  const response = await fetch(process.env.VECTOR_FILE_URL);
  const buffer = await response.arrayBuffer();
  const jsonString = (await gunzipAsync(buffer)).toString('utf-8');

  cachedIndex = JSON.parse(jsonString); // 메모리에 캐싱
  return cachedIndex;
}

// 브루트포스 검색 (메모리 내 코사인 유사도 계산)
function searchVectors(queryEmbedding: number[], topK: number) {
  const similarities = cachedIndex.vectors.map(vec => ({
    ...vec,
    score: cosineSimilarity(queryEmbedding, vec.embedding)
  }));

  return similarities.sort((a, b) => b.score - a.score).slice(0, topK);
}
```

#### Consequences (결과)
**장점**:
- ✅ 서버 비용 $0 (정적 파일만)
- ✅ Serverless 완벽 호환 (Lambda 메모리 캐싱)
- ✅ CDN 활용으로 빠른 다운로드 (10-30ms)
- ✅ 읽기 전용에 최적화

**단점**:
- ⚠️ 벡터 수 제한 (메모리 1GB → ~10,000 vectors)
- ⚠️ 검색 성능 (브루트포스 O(n), 하지만 1,000 vectors에서는 50ms)
- ⚠️ 실시간 업데이트 불가 (하지만 CI에서 주기적 업데이트로 충분)

**성능 비교**:
```
ChromaDB (서버):
- 검색 속도: 10-30ms (HNSW 인덱스)
- 서버 비용: $20-50/월
- Cold Start: 0ms (항상 실행 중)

File-based:
- 검색 속도: 51-151ms (브루트포스)
- 서버 비용: $0/월
- Cold Start: 150-380ms (파일 다운로드)
- Warm Start: 51-151ms (캐시 히트)
```

#### Alternatives (대안)
1. **ChromaDB Cloud**: $30-100/월, 관리 부담 없지만 비용 발생
2. **Pinecone/Weaviate**: SaaS 벡터 DB, 무료 tier 있지만 제한적
3. **Supabase pgvector**: $25/월, 읽기/쓰기 모두 가능하지만 비용 발생

---

### 면접 답변 (30초)

> "ChromaDB는 벡터 검색에 특화된 훌륭한 도구지만, 24/7 서버 운영이 필요해 월 $20-50의 비용이 발생합니다. 저희 시스템은 읽기 전용 Q&A이고 임베딩 생성은 CI에서만 발생하므로, 정적 JSON 파일로 충분하다고 판단했습니다. Gzip 압축된 JSON 파일을 CDN에 올리고 Vercel Lambda 메모리에 캐싱하면 Cold Start 380ms, Warm Start 51ms로 충분히 빠른 검색이 가능했고, 이를 통해 서버 비용을 0원으로 유지하면서도 1,000개 이하 벡터에서는 ChromaDB와 비슷한 성능을 달성했습니다."

---

## 3. 왜 임베딩을 CI에서 수행하는가?

### 핵심 답변

> **"API 서버에서 임베딩을 실시간 생성하면 응답 시간이 길어지고 비용이 증가하며, 코드 변경 시에만 임베딩이 업데이트되므로 GitHub Actions에서 배치로 처리하는 것이 효율적이기 때문입니다."**

---

### 상세 설명

#### Context (배경)
- 임베딩 대상: GitHub 레포지토리의 커밋, 파일, Diff
- 임베딩 모델: OpenAI text-embedding-3-small ($0.020 / 1M tokens)

#### Problem (문제점)
**API 서버에서 실시간 임베딩 생성 시 문제**:

1. **응답 시간 증가**:
   ```
   사용자 질문 → 레포지토리 전체 임베딩 → 검색 → 답변

   1,000 commits × 100ms = 100초 (1.7분)
   → 사용자가 받아들일 수 없는 대기 시간
   ```

2. **비용 폭증**:
   ```
   질문 1개당 = 전체 레포지토리 임베딩 비용

   1,000 commits × 500 tokens = 500,000 tokens
   500,000 tokens × $0.020 / 1M = $0.01/질문

   일 100 질문 = $1/일 = $30/월 (임베딩 비용만)
   ```

3. **중복 작업**:
   - 동일한 커밋/파일을 매 질문마다 재임베딩
   - 레포지토리는 변경 빈도 낮음 (일 1-10 push)

#### Decision (결정)
**GitHub Actions CI에서 임베딩 수행 + 정적 파일 배포**

```yaml
# .github/workflows/polling-embed.yml
on:
  schedule:
    - cron: "0 18 * * 6"  # 주 1회 실행
  push:
    branches: [main]      # 또는 코드 변경 시

jobs:
  embed:
    runs-on: ubuntu-latest
    steps:
      # 1. 새 커밋 감지 (commit-state.json 기반)
      - name: Poll new commits
        run: pnpm run dev

      # 2. 새 커밋만 임베딩 (증분 업데이트)
      # 3. Supabase에 저장

      # 4. JSON 파일로 내보내기
      - name: Export to file
        run: pnpm tsx scripts/export-embeddings.ts --upload vercel

      # 5. Vercel Blob에 업로드 (CDN)
```

**파이프라인 구조**:
```
GitHub Push → GitHub Actions
                    ↓
            [1. 변경 감지]
         commit-state.json 확인
                    ↓
            [2. 증분 임베딩]
         새 커밋만 OpenAI API
                    ↓
            [3. Supabase 저장]
         벡터 + 메타데이터
                    ↓
            [4. JSON 내보내기]
         embeddings.json.gz
                    ↓
            [5. CDN 업로드]
         Vercel Blob Storage
```

#### Consequences (결과)
**장점**:
- ✅ API 응답 속도: 2.4초 (임베딩 생성 제외)
- ✅ 비용 최적화: 주 1회 배치 vs 실시간 매 질문
   ```
   CI 방식:
   - 새 커밋 10개/주 × 500 tokens = 5,000 tokens
   - 5,000 × $0.020 / 1M = $0.0001/주 = $0.004/월

   실시간 방식:
   - 100 질문/일 × 500,000 tokens = $30/월

   절감: $29.996/월 (99.98% 절감)
   ```
- ✅ 캐싱 효과: 동일 데이터를 모든 사용자가 공유
- ✅ 증분 업데이트: commit-state.json으로 중복 방지

**단점**:
- ⚠️ 실시간 업데이트 불가 (하지만 코드는 주 1회 변경)
- ⚠️ CI 실행 시간: 15-30분 (하지만 사용자 경험에 영향 없음)

**비용 비교**:
```
실시간 임베딩 (API 서버):
- OpenAI API: $30/월 (임베딩)
- 서버 비용: $20-50/월 (컴퓨팅 자원)
- Total: $50-80/월

CI 임베딩 (GitHub Actions):
- GitHub Actions: $0/월 (무료 tier, 주 1회 60분)
- OpenAI API: $0.004/월 (주 10개 커밋)
- Vercel Blob: $0/월 (무료 tier)
- Total: ~$0/월
```

#### Alternatives (대안)
1. **실시간 임베딩**: 비용 폭증, 응답 시간 증가
2. **Webhook 기반**: 복잡도 증가, GitHub Webhook 설정 필요
3. **수동 실행**: 자동화 없음, 운영 부담

---

### 면접 답변 (30초)

> "임베딩을 API 서버에서 실시간 생성하면 사용자가 1분 이상 대기해야 하고 OpenAI API 비용이 월 $30 이상 발생합니다. 하지만 GitHub 레포지토리는 하루에 1-10번만 변경되므로, GitHub Actions에서 주 1회 또는 Push 시 배치로 임베딩을 생성하는 것이 훨씬 효율적입니다. commit-state.json으로 이미 처리한 커밋을 추적해 증분 업데이트만 수행하고, 생성된 임베딩은 Gzip 압축 JSON 파일로 Vercel Blob CDN에 업로드합니다. 이를 통해 임베딩 비용을 월 $0.004로 줄이고 API 응답 시간을 2.4초로 유지할 수 있었습니다."

---

## 4. 서버 비용을 어떻게 0원으로 유지했는가?

### 핵심 답변

> **"Vercel Serverless (무료 tier), GitHub Actions (무료 tier), Vercel Blob (무료 tier)을 조합하고, 읽기 전용 아키텍처와 파일 기반 벡터 스토어로 24/7 서버 운영을 제거했습니다."**

---

### 상세 설명

#### Context (배경)
- 목표: 프로덕션 수준의 Q&A 시스템, 월 500 질문 처리
- 제약: 개인 프로젝트, 비용 최소화

#### Problem (문제점)
**Traditional 서버 비용**:
```
ChromaDB 서버 (Docker):       $20-50/월
API 서버 (Node.js):           $10-20/월
데이터베이스 (PostgreSQL):    $25/월
파일 스토리지 (S3):           $5/월
──────────────────────────────────
Total:                        $60-100/월
```

#### Decision (결정)
**Serverless + 무료 tier 조합**

| 컴포넌트 | 서비스 | 무료 tier | 예상 사용량 | 비용 |
|---------|--------|----------|-----------|------|
| API 서버 | Vercel Serverless | 100GB-Hours/월 | 0.33GB-Hours | $0 |
| 벡터 저장 | Vercel Blob | 1GB | 2.3MB | $0 |
| 이력 저장 | Supabase | 500MB DB | ~10MB | $0 |
| CI 실행 | GitHub Actions | 2,000분/월 | 60분/월 | $0 |
| LLM API | OpenAI | Pay-as-you-go | 500 queries | ~$8 |

**Total: ~$8/월** (순수 API 사용료만)

---

### 핵심 전략

#### 1. Serverless 활용 (Vercel)

**기존 방식**:
```
Express 서버 24/7 운영
→ 사용 여부와 무관하게 $10-20/월
```

**Serverless 방식**:
```typescript
// api/ask.ts (Vercel Function)
export default async function handler(req, res) {
  // 요청이 들어올 때만 실행 (Cold Start)
  // Lambda 컨테이너 재사용으로 Warm Start
}

// 비용: 실행 시간만 과금
// 500 queries × 2.4초 × 1GB = 0.33GB-Hours
// 무료 tier: 100GB-Hours/월
// → $0/월
```

---

#### 2. 파일 기반 벡터 스토어

**기존 방식**:
```
ChromaDB 서버 24/7 운영
→ Docker 컨테이너 호스팅 $20-50/월
```

**파일 기반 방식**:
```typescript
// 정적 파일 (embeddings.json.gz)
// Vercel Blob에 업로드 → CDN 배포

// Lambda 메모리에 캐싱
let cachedIndex: VectorIndex | null = null;

async function loadVectorIndex() {
  if (cachedIndex) return cachedIndex; // Warm Start

  // CDN에서 다운로드 (2.3MB)
  const response = await fetch(process.env.VECTOR_FILE_URL);
  cachedIndex = JSON.parse(await response.text());
  return cachedIndex;
}

// 비용: 파일 저장 (2.3MB) + CDN 트래픽 (1.5GB/월)
// 무료 tier: 1GB storage, 100GB bandwidth
// → $0/월
```

---

#### 3. CI에서 임베딩 생성

**기존 방식**:
```
API 서버에서 실시간 임베딩
→ OpenAI API $30/월
→ 서버 컴퓨팅 비용 증가
```

**CI 방식**:
```yaml
# GitHub Actions (주 1회 실행)
# 무료 tier: 2,000분/월
# 사용량: 60분/월 (3%)

jobs:
  embed:
    runs-on: ubuntu-latest  # GitHub 제공 무료 러너
    steps:
      - name: Run pipeline
        run: pnpm run dev
      # OpenAI API: 주 10 commits = $0.004/월
```

---

#### 4. Supabase 무료 tier

**데이터**:
- Q&A 이력: 500개/월 × 2KB = 1MB
- 벡터 데이터: 1,000 vectors × 6KB = 6MB
- Total: ~7MB

**무료 tier**:
- Database: 500MB (1.4% 사용)
- API 요청: 무제한
- → $0/월

---

### 비용 비교표

| 항목 | Traditional | Serverless | 절감 |
|-----|-------------|-----------|------|
| API 서버 | $10-20/월 | $0/월 | -100% |
| 벡터 DB | $20-50/월 | $0/월 | -100% |
| PostgreSQL | $25/월 | $0/월 (Supabase) | -100% |
| 스토리지 | $5/월 | $0/월 (Vercel Blob) | -100% |
| CI/CD | $10/월 | $0/월 (GitHub Actions) | -100% |
| **인프라 합계** | **$70-110/월** | **$0/월** | **-100%** |
| OpenAI API | $30/월 (실시간) | $8/월 (배치) | -73% |
| **전체 합계** | **$100-140/월** | **$8/월** | **-94%** |

---

#### Consequences (결과)
**장점**:
- ✅ 인프라 비용 $0 (무료 tier 범위 내)
- ✅ OpenAI API 비용 $8/월 (실시간 대비 73% 절감)
- ✅ 자동 스케일링 (Vercel Auto-scaling)
- ✅ 글로벌 CDN (Vercel Edge Network)

**단점**:
- ⚠️ Cold Start 발생 (첫 요청 2.5초, 이후 2.4초)
- ⚠️ 무료 tier 제한 (트래픽 증가 시 유료 전환 필요)
- ⚠️ Vendor Lock-in (Vercel, Supabase)

**확장성**:
```
무료 tier 한계:
- Vercel: 100GB-Hours (월 ~3,000 requests)
- Supabase: 500MB DB (월 ~50,000 Q&A)
- GitHub Actions: 2,000분/월 (주 8회 실행 가능)

→ 개인 프로젝트/포트폴리오 수준에서는 충분
→ 상용 서비스는 Pro Plan ($20-30/월) 고려
```

---

### 면접 답변 (30초)

> "서버 비용 0원을 달성하기 위해 세 가지 핵심 전략을 사용했습니다. 첫째, Vercel Serverless Functions로 24/7 서버 운영을 제거했습니다. 무료 tier가 100GB-Hours/월인데 제 시스템은 0.33GB-Hours만 사용해 충분합니다. 둘째, ChromaDB 서버 대신 Gzip 압축 JSON 파일을 Vercel Blob CDN에 올려 벡터 DB 비용을 제거했습니다. 셋째, 임베딩 생성을 API 서버가 아닌 GitHub Actions에서 주 1회 배치로 수행해 OpenAI API 비용을 월 $30에서 $0.004로 줄였습니다. Supabase 무료 tier로 Q&A 이력을 저장하고, 모든 무료 tier를 조합해 인프라 비용 $0, OpenAI API 비용만 월 $8로 프로덕션 수준의 시스템을 운영하고 있습니다."

---

## 5. 왜 Supabase를 병행하는가?

### 핵심 답변

> **"Supabase는 Q&A 이력 저장, 벡터 데이터 백업, 읽기/쓰기 지원으로 파일 기반 스토어의 단점을 보완하며, 무료 tier로 충분하기 때문입니다."**

---

### 상세 설명

#### Context (배경)
- 파일 기반 벡터 스토어: 읽기 전용, 정적
- Supabase pgvector: PostgreSQL 기반, 벡터 검색 지원

#### Use Cases (사용 사례)

**1. Q&A 이력 저장**
```typescript
// src/service/server/services/supabase.ts
export async function saveQAHistory(data: {
  session_id: string;
  question: string;
  answer: string;
  category: string;
  sources: any[];
  response_time_ms: number;
  token_usage: number;
}) {
  await supabase.from('qa_history').insert(data);
}

// 프론트엔드에서 이력 조회
const { data } = await supabase
  .from('qa_history')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(50);
```

**2. 벡터 데이터 백업**
```typescript
// CI에서 Supabase에 벡터 저장
await saveVectorsSupabase(embeddings); // Supabase에 저장

// 파일 내보내기 시 Supabase에서 읽기
const vectors = await supabase
  .from('embeddings')
  .select('*');

// JSON 파일 생성
await exportToFile(vectors, 'embeddings.json.gz');
```

**3. 대시보드 통계**
```typescript
// SQL로 통계 쿼리
const { data: stats } = await supabase.rpc('get_qa_stats');

// 일별 질문 수, 카테고리 분포, 평균 응답 시간 등
```

#### Decision (결정)
**파일 기반 (읽기) + Supabase (쓰기/백업) 병행**

```
사용자 질문 → Vercel Serverless
                    ↓
           파일 기반 벡터 검색 (빠름)
                    ↓
              OpenAI 답변 생성
                    ↓
         Supabase에 이력 저장 (비동기)
                    ↓
              사용자 응답 반환
```

---

### 면접 답변 (20초)

> "파일 기반 벡터 스토어는 읽기 전용이라 Q&A 이력을 저장할 수 없습니다. Supabase를 병행해 사용자 질문/답변 이력, 세션 정보, 대시보드 통계를 PostgreSQL에 저장하고, 벡터 데이터도 백업해 파일 내보내기 시 소스로 사용합니다. Supabase 무료 tier로 500MB까지 사용 가능해 비용 없이 운영 중입니다."

---

## 6. 왜 증분 업데이트를 구현했는가?

### 핵심 답변

> **"매번 전체 레포지토리를 재임베딩하면 시간과 비용이 낭비되므로, commit-state.json으로 처리 완료된 커밋을 추적해 새 커밋만 처리합니다."**

---

### 상세 설명

#### Context (배경)
- GitHub 레포지토리: 일 1-10 push (대부분 기존 코드 유지)
- 임베딩 대상: 1,000+ commits

#### Problem (문제점)
**전체 재임베딩 방식**:
```
매주 실행 시:
1,000 commits × 500 tokens × $0.020 / 1M = $0.01/주
→ 1년: $0.52

시간: 1,000 commits × 2초 = 33분

문제:
- 이미 처리한 커밋을 매번 재처리
- GitHub Actions 실행 시간 낭비 (무료 tier 2,000분)
- OpenAI API 비용 낭비
```

#### Decision (결정)
**commit-state.json 기반 증분 업데이트**

```typescript
// src/embedding-pipeline/services/commitStateManager.ts
interface CommitStateStore {
  repositories: {
    [id: string]: {
      lastProcessedCommit: string;  // 마지막 처리 커밋 SHA
      lastProcessedAt: string;       // 처리 시각
      totalCommitsProcessed: number; // 총 처리 커밋 수
    };
  };
  lastUpdated: string;
}

// 1. 마지막 처리 커밋 조회
const lastCommit = stateManager.getLastProcessedCommit(owner, repo);

// 2. GitHub API로 새 커밋만 조회
const newCommits = await fetchCommitsSince(lastCommit);

// 3. 새 커밋만 임베딩
for (const commit of newCommits) {
  await generateEmbedding(commit);
}

// 4. 상태 업데이트
stateManager.updateProcessedCommit(owner, repo, latestCommitSha);
```

**GitHub Actions 상태 복원**:
```yaml
# .github/workflows/polling-embed.yml
steps:
  # 이전 실행 상태 복원
  - name: Download previous commit state
    uses: actions/download-artifact@v4
    with:
      name: commit-state
      path: .
    continue-on-error: true

  # 파이프라인 실행 (증분)
  - name: Run pipeline
    run: pnpm run dev

  # 새 상태 저장
  - name: Upload commit state
    uses: actions/upload-artifact@v4
    with:
      name: commit-state
      path: commit-state.json
      retention-days: 90
```

#### Consequences (결과)
**증분 업데이트 효과**:
```
주 10개 새 커밋:
10 commits × 500 tokens × $0.020 / 1M = $0.0001/주
→ 1년: $0.005

시간: 10 commits × 2초 = 20초

절감:
- 비용: 99% 감소 ($0.52 → $0.005)
- 시간: 99% 감소 (33분 → 20초)
- GitHub Actions 분: 32분 절약
```

---

### 면접 답변 (20초)

> "GitHub 레포지토리는 하루에 1-10개 커밋만 추가되는데 매번 전체 1,000개를 재임베딩하면 시간과 비용 낭비입니다. commit-state.json에 마지막 처리 커밋 SHA를 저장하고 GitHub API로 그 이후 커밋만 조회해 증분 업데이트합니다. 이를 통해 실행 시간을 33분에서 20초로, OpenAI API 비용을 99% 줄였습니다."

---

## 7. 왜 파일 기반 벡터 스토어를 선택했는가?

### 핵심 답변

> **"읽기 전용 Q&A 시스템에서는 벡터 업데이트가 드물고, Serverless 환경과 호환되며, 정적 파일로 충분히 빠른 검색이 가능하고, 서버 비용이 0원이기 때문입니다."**

---

### 상세 설명

#### Context (배경)
- 벡터 데이터: 1,000개 이하 (1536차원)
- 검색 빈도: 일 100회
- 업데이트 빈도: 주 1회

#### Comparison (비교)

| 항목 | ChromaDB | Supabase pgvector | File-based |
|-----|----------|-------------------|-----------|
| **서버 비용** | $20-50/월 | $25/월 | $0/월 |
| **검색 속도** | 10-30ms (HNSW) | 50-100ms (IVFFlat) | 51-151ms (브루트포스) |
| **Cold Start** | 0ms (항상 실행) | 0ms | 150-380ms |
| **Warm Start** | - | - | 51-151ms |
| **Serverless** | ❌ (서버 필요) | ⚠️ (연결 제한) | ✅ (완벽 호환) |
| **확장성** | 수백만 vectors | 수백만 vectors | ~10,000 vectors |
| **읽기/쓰기** | 둘 다 가능 | 둘 다 가능 | 읽기만 |

#### Decision (결정)
**파일 기반 벡터 스토어 (1,000 vectors 이하 시스템에 최적)**

**성능 검증**:
```
1,000 vectors × 1536 dimensions:
- 메모리: ~30MB
- 검색 시간: 51-151ms (Warm Start)
- Cold Start: 150-380ms

사용자 경험:
- 평균 응답 시간: 2.4초 (검색은 6%)
- LLM 생성이 병목 (1-3초, 60%)
→ 검색 속도는 충분히 빠름
```

---

### 면접 답변 (20초)

> "ChromaDB는 HNSW 인덱스로 10-30ms 검색이 가능하지만 서버 비용 $20-50/월이 발생합니다. 제 시스템은 1,000개 이하 벡터에 읽기 전용이므로 브루트포스 검색(51-151ms)으로 충분하고, LLM 생성(1-3초)이 진짜 병목이라 파일 기반으로도 사용자 경험에 문제가 없었습니다. Serverless 완벽 호환과 서버 비용 $0를 위해 파일 기반을 선택했습니다."

---

## 📊 전체 아키텍처 요약

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Repository                     │
│              (코드 변경, 커밋 발생)                      │
└──────────────────────┬──────────────────────────────────┘
                       │ Push Event
                       ▼
         ┌─────────────────────────────┐
         │    GitHub Actions (CI)      │
         │  - 새 커밋 감지 (증분)      │
         │  - OpenAI 임베딩 생성       │
         │  - Supabase 저장            │
         │  - JSON 파일 내보내기       │
         │  - Vercel Blob 업로드       │
         │  비용: $0/월 (무료 tier)    │
         └────────┬────────────────────┘
                  │
      ┌───────────┼──────────┐
      │           │          │
      ▼           ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│Supabase │ │ Vercel  │ │ GitHub  │
│(백업)   │ │  Blob   │ │Artifacts│
│$0/월    │ │ (CDN)   │ │ (상태)  │
│         │ │ $0/월   │ │         │
└─────────┘ └────┬────┘ └─────────┘
                  │
                  │ embeddings.json.gz
                  │ (2.3MB, Gzip)
                  ▼
         ┌─────────────────────────────┐
         │  Vercel Serverless (API)    │
         │  - 파일 다운로드 + 캐싱     │
         │  - 벡터 검색 (메모리)       │
         │  - OpenAI LLM 답변 생성     │
         │  - Supabase 이력 저장       │
         │  비용: $0/월 (무료 tier)    │
         │  + OpenAI API: ~$8/월       │
         └─────────────────────────────┘
                       │
                       ▼
              ┌─────────────┐
              │  사용자      │
              │ (2.4초 응답) │
              └─────────────┘
```

**핵심 설계 원칙**:
1. ✅ **읽기 전용 API**: 임베딩은 CI에서만
2. ✅ **Serverless First**: 24/7 서버 제거
3. ✅ **증분 업데이트**: 중복 작업 방지
4. ✅ **무료 tier 최대화**: 인프라 비용 $0
5. ✅ **성능 vs 비용 트레이드오프**: 2.4초 응답으로 충분

---

**작성일**: 2025-12-31
**버전**: 1.0.0
**프로젝트**: GitHub Repository NLP Analyzer
