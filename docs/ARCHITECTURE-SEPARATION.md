# 임베딩 생성과 서비스 요청 처리 완전 분리 아키텍처

**작성일**: 2025-12-31
**원칙**: 서비스 코드에서는 임베딩을 절대 생성하지 않음. 임베딩은 파일 산출물로만 전달됨.

---

## 📁 디렉토리 구조

```
src/
├── embedding-pipeline/          # 임베딩 생성 영역 (오프라인)
│   ├── pipelines/
│   │   ├── runPipeline.ts              # 전체 임베딩 파이프라인
│   │   ├── runPollingPipeline.ts       # 폴링 기반 파이프라인
│   │   └── steps/
│   │       ├── preprocessText.ts       # 텍스트 전처리
│   │       └── (기타 전처리 단계)
│   ├── data_sources/
│   │   ├── git/                        # Git 로컬 클론 (레거시)
│   │   └── github/                     # GitHub API 호출
│   │       ├── fetchCommit.ts
│   │       ├── fetchFiles.ts
│   │       └── fetchRepositoryFiles.ts
│   ├── nlp/
│   │   └── embedding/
│   │       ├── openaiEmbedding.ts      # OpenAI 임베딩 생성
│   │       └── embeddingTextGenerator.ts
│   ├── storage/
│   │   ├── saveVectors.ts              # ChromaDB 저장
│   │   ├── saveVectorsSupabase.ts      # Supabase 저장
│   │   └── supabaseVectorStore.ts      # Supabase 클라이언트
│   └── services/
│       ├── repositoryPoller.ts         # 파일 기반 폴링
│       └── repositoryPollerSupabase.ts # Supabase 기반 폴링
│
├── service/                     # 서비스 요청 처리 영역 (온라인)
│   ├── server/
│   │   ├── index.ts                    # Express 서버
│   │   ├── routes/
│   │   │   ├── ask.ts                  # POST /api/ask
│   │   │   ├── health.ts               # GET /api/health
│   │   │   └── history.ts              # GET /api/history
│   │   └── services/
│   │       └── supabase.ts             # Supabase 이력 저장
│   ├── vector-store/
│   │   ├── searchVectors.ts            # ChromaDB 검색만
│   │   ├── searchVectorsSupabase.ts    # Supabase 검색만
│   │   └── embeddingService.ts         # 쿼리 임베딩 외부 API 래퍼
│   ├── qa/
│   │   ├── answer.ts                   # LLM 답변 생성
│   │   ├── classifier.ts               # 질문 분류
│   │   └── searchStrategy.ts           # 검색 전략
│   └── cli/
│       └── (CLI 명령어 - 예정)
│
└── shared/                      # 공유 모델 (읽기 전용)
    ├── models/
    │   ├── EmbeddingItem.ts            # 임베딩 데이터 구조
    │   ├── SearchResult.ts             # 검색 결과 구조
    │   ├── PipelineOutput.ts           # 파이프라인 산출물
    │   ├── Commit.ts
    │   ├── File.ts
    │   ├── refinedData.ts
    │   ├── TargetRepository.ts
    │   └── ConversationSession.ts
    ├── types/
    │   └── index.ts                    # 공통 타입 정의
    └── utils/
        └── tokenCounter.ts             # 토큰 카운팅 유틸
```

---

## ⏱️ 각 영역의 실행 시점

### 임베딩 생성 영역 (Offline - 사전 실행)

| 컴포넌트 | 실행 시점 | 트리거 | 출력 |
|---------|----------|--------|------|
| **runPipeline.ts** | 수동 실행 (`pnpm run dev`) | 개발자 명령 | Supabase/ChromaDB에 벡터 저장 |
| **runPollingPipeline.ts** | GitHub Actions (스케줄) | Cron (매일 0시) 또는 Push 이벤트 | 새 커밋만 임베딩 후 저장 |
| **generateEmbeddings** | 파이프라인 내부 Step | 전처리 완료 후 자동 | `embeddings: number[][]` |
| **saveVectorsSupabase** | 파이프라인 내부 Step | 임베딩 생성 완료 후 | Supabase `embeddings` 테이블 INSERT |

**실행 주기**:
- 로컬: 개발자가 수동 실행 (`pnpm run dev`)
- CI/CD: GitHub Actions가 자동 실행 (새 커밋 감지 시)

**책임**:
- GitHub에서 데이터 fetch
- OpenAI API 호출하여 임베딩 생성
- Vector DB에 저장

---

### 서비스 요청 처리 영역 (Online - 런타임)

| 컴포넌트 | 실행 시점 | 트리거 | 입력 |
|---------|----------|--------|------|
| **server/index.ts** | 서버 시작 (`pnpm run server`) | 프로세스 시작 | - |
| **routes/ask.ts** | HTTP 요청 | `POST /api/ask` | `{ question: string }` |
| **searchVectorsSupabase** | 질문 수신 후 | `/api/ask` 내부 호출 | Supabase에서 **기존 임베딩** 읽기 |
| **embeddingService** | 쿼리 임베딩 필요 시 | 검색 전 | 외부 API로 **쿼리만** 임베딩 |
| **answer.ts** | 검색 완료 후 | 컨텍스트 확보 후 | `SearchResult[]` + `question` |

**실행 주기**:
- 24/7 상시 실행 (Express 서버)
- 요청당 1회 실행 (Stateless)

**책임**:
- 사용자 질문을 **쿼리 임베딩으로 변환** (OpenAI API 1회만)
- Vector DB에서 유사 벡터 **검색만** (저장 금지)
- LLM으로 답변 생성
- ❌ **문서 임베딩 생성 금지**
- ❌ **Vector DB에 임베딩 저장 금지**

---

## 🔒 설계 원칙 및 제약사항

### 1. 임베딩 생성 분리

**원칙**: 서비스 코드는 임베딩을 생성하지 않음

**Before (위반)**:
```typescript
// ❌ 서비스 코드에서 직접 임베딩 생성
import { generateEmbeddings } from "../nlp/embedding/openaiEmbedding.js";

export async function searchVectors(query: string) {
    const embeddings = await generateEmbeddings([query]);  // ❌ 위반
    const queryEmbedding = embeddings[0];
    // ...
}
```

**After (준수)**:
```typescript
// ✅ 외부 서비스를 통해 쿼리 임베딩만 요청
import { generateQueryEmbedding } from "./embeddingService.js";

export async function searchVectors(query: string) {
    const queryEmbedding = await generateQueryEmbedding(query);  // ✅ 쿼리만
    // ...
}
```

### 2. Vector 저장 금지

**원칙**: 서비스는 읽기 전용. 저장은 파이프라인에서만

**Before (위반)**:
```typescript
// ❌ 서비스에서 Q&A를 벡터에 저장
import { saveQAToVector } from "../../vector_store/saveQAToVector.js";

router.post('/ask', async (req, res) => {
    const answer = await generateAnswer(question, contexts);

    // ❌ 서비스가 임베딩 생성 + 저장
    await saveQAToVector(collectionName, question, answer);  // 위반!

    res.json({ answer });
});
```

**After (준수)**:
```typescript
// ✅ 서비스는 검색만, 저장은 별도 파이프라인
router.post('/ask', async (req, res) => {
    const answer = await generateAnswer(question, contexts);

    // ✅ Q&A 저장은 별도 배치 작업으로 처리
    // (embedding-pipeline에서 주기적으로 실행)

    res.json({ answer });
});
```

### 3. 공유 모델 사용

**원칙**: 두 영역이 동일한 타입 정의 사용

```typescript
// shared/models/SearchResult.ts
export interface SearchResult {
    id: string;
    content: string;
    metadata: Record<string, any>;
    score: number;
}
```

- `embedding-pipeline/storage/saveVectorsSupabase.ts` - 이 타입으로 저장
- `service/vector-store/searchVectorsSupabase.ts` - 이 타입으로 검색

---

## 🎯 분리가 필요한 이유

임베딩 생성은 **비용과 시간이 많이 드는 배치 작업**이고, 서비스 요청 처리는 **실시간 응답이 필요한 온라인 작업**이다.

두 영역을 분리하면:

1. **응답 속도 개선**: 서비스는 사전에 생성된 임베딩만 읽어 빠른 응답 보장 (100-200ms)
2. **서버 부하 제거**: 임베딩 생성은 GitHub Actions 같은 스케줄러에서 독립적으로 실행되어 서버 CPU 부하 제거
3. **보안 강화**: 서비스 코드에서 OpenAI API 키가 노출될 위험 감소 (임베딩 파이프라인만 필요)
4. **Serverless 호환**: Vercel Functions 같은 환경에서도 타임아웃 없이 배포 가능 (10초 제한)
5. **독립적 스케일링**: 트래픽 급증 시 서비스 서버만 확장, 대량 임베딩 시 파이프라인만 별도 인스턴스에서 실행

---

## 🔄 데이터 흐름

### 임베딩 생성 플로우 (Offline)

```
GitHub Push Event
    ↓
GitHub Actions 트리거
    ↓
runPollingPipeline() 실행
    ↓
1. GitHub API → 새 커밋 감지
2. fetchCommit(), fetchFiles() → 데이터 수집
3. refineData() → 전처리
4. generateEmbeddings() → OpenAI API 호출
5. saveVectorsSupabase() → Supabase INSERT
    ↓
임베딩 저장 완료 (서비스에서 사용 가능)
```

### 서비스 요청 플로우 (Online)

```
사용자 질문 (POST /api/ask)
    ↓
1. classifyQuestionWithConfidence() → 질문 분류
2. generateQueryEmbedding(query) → 쿼리 임베딩 (OpenAI API 1회)
3. searchVectorsSupabase(queryEmbedding) → 유사 벡터 검색
4. generateAnswer(question, contexts) → LLM 답변 생성
5. saveQAHistory() → Supabase history 테이블에 저장
    ↓
Response: { answer, sources, ... }
```

**핵심**:
- 문서 임베딩은 이미 Supabase에 저장되어 있음 (Offline)
- 서비스는 쿼리 임베딩만 생성하고, 문서 임베딩은 검색만 함

---

## 📦 주요 컴포넌트 설명

### embedding-pipeline

#### `pipelines/runPipeline.ts`
- GitHub API로 커밋/파일 데이터 수집
- OpenAI로 임베딩 생성
- Supabase 또는 ChromaDB에 저장
- **환경**: GitHub Actions, 로컬 CLI

#### `storage/saveVectorsSupabase.ts`
- Supabase `embeddings` 테이블에 벡터 저장
- Batch upsert 지원 (1000개/배치)
- Reset 모드: 기존 데이터 삭제 후 재저장

#### `services/repositoryPollerSupabase.ts`
- Supabase `commit_states` 테이블에서 마지막 처리 커밋 조회
- 새 커밋만 임베딩 (Idempotent)
- Serverless 환경에서 파일 시스템 대신 DB 사용

---

### service

#### `vector-store/embeddingService.ts`
- **쿼리 임베딩만** 생성하는 래퍼 서비스
- OpenAI API 호출을 캡슐화
- 문서 임베딩 생성 금지 (주석으로 명시)

```typescript
/**
 * 주의: 이 서비스는 **쿼리 임베딩만** 생성합니다.
 * 문서 임베딩은 embedding-pipeline에서만 생성됩니다.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]>
```

#### `vector-store/searchVectorsSupabase.ts`
- Supabase에서 유사도 검색만 수행
- `match_embeddings()` RPC 함수 호출
- 메타데이터 필터링 지원 (owner/repo)

#### `server/routes/ask.ts`
- POST /api/ask 엔드포인트
- 질문 분류 → 검색 → 답변 생성 → 이력 저장
- **임베딩 저장 로직 제거됨** (기존 saveQAToVector 호출 삭제)

---

### shared

#### `models/SearchResult.ts`
- ChromaDB와 Supabase 모두 사용하는 공통 타입
- 두 Vector Store 간 호환성 보장

```typescript
export interface SearchResult {
    id: string;
    content: string;
    metadata: Record<string, any>;
    score: number;
}
```

#### `models/EmbeddingItem.ts`
- 파이프라인에서 저장하는 임베딩 데이터 구조
- Supabase `embeddings` 테이블과 1:1 매핑

---

## 🔍 코드 검증

### 위반 체크리스트

다음 패턴이 **service/** 영역에 없어야 함:

```bash
# ❌ 서비스에서 임베딩 생성 금지
grep -r "generateEmbeddings" src/service/  # embeddingService.ts 제외

# ❌ 서비스에서 벡터 저장 금지
grep -r "saveVectors" src/service/

# ❌ 서비스에서 saveQAToVector 호출 금지
grep -r "saveQAToVector" src/service/
```

### 허용되는 패턴

```bash
# ✅ 서비스는 검색만
grep -r "searchVectors" src/service/

# ✅ 쿼리 임베딩만 (embeddingService를 통해)
grep -r "generateQueryEmbedding" src/service/
```

---

## 🚀 배포 가이드

### 로컬 개발

```bash
# 1. 임베딩 생성 (Offline)
pnpm run dev  # 또는 pnpm run dev --reset

# 2. 서비스 시작 (Online)
pnpm run server  # 포트 3001

# 3. 질문 테스트
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "프로젝트 기술스택은?"}'
```

### GitHub Actions (자동 임베딩)

```yaml
name: Embedding Pipeline

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'  # 매일 0시

jobs:
  embed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: pnpm install
      - run: pnpm run dev  # runPollingPipeline 실행
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

### Vercel (서비스만 배포)

```
vercel deploy
```

- `api/ask.ts` → Serverless Function
- 임베딩 생성 코드 제외 (빌드 크기 감소)
- 10초 타임아웃 준수 (검색만 수행)

---

## 📚 관련 문서

- [SUPABASE-USAGE.md](./SUPABASE-USAGE.md) - Supabase 사용법
- [SERVERLESS-MIGRATION.md](./SERVERLESS-MIGRATION.md) - Serverless 마이그레이션
- [CLAUDE.md](./CLAUDE.md) - 프로젝트 전체 가이드

---

## ✅ 체크리스트

프로젝트가 설계 원칙을 준수하는지 확인:

- [x] `src/service/` 디렉토리에 `generateEmbeddings` import 없음
- [x] `src/service/` 디렉토리에 `saveVectors` 호출 없음
- [x] `saveQAToVector.ts` 파일 제거됨
- [x] `embeddingService.ts`에 쿼리 임베딩만 생성하는 주석 명시
- [x] `SearchResult` 타입이 `shared/models/`에 정의됨
- [x] `embedding-pipeline/`과 `service/`가 명확히 분리됨
- [x] TypeScript 빌드 성공 (`pnpm run build`)

---

**핵심**: 임베딩 생성은 오프라인 배치, 서비스는 온라인 검색만. 완전 분리로 성능/보안/확장성 확보.
