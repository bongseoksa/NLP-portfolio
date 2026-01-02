# Serverless Migration Guide

ChromaDB (로컬 서버) → Supabase Vector (Cloud) 마이그레이션 가이드

---

## 📋 변경 사항 요약

| 구성요소 | Before (로컬) | After (Serverless) |
|----------|---------------|-------------------|
| **Vector DB** | ChromaDB (Port 8000) | Supabase pgvector |
| **Commit 상태** | commit-state.json (파일) | Supabase Table |
| **데이터 저장** | saveVectors.ts | saveVectorsSupabase.ts |
| **벡터 검색** | searchVectors.ts | searchVectorsSupabase.ts |
| **폴링 서비스** | RepositoryPoller (파일 기반) | RepositoryPollerSupabase (DB 기반) |
| **설정 파일** | target-repos.json | 환경 변수만 사용 |

---

## 🚀 마이그레이션 단계

### Step 1: Supabase 스키마 설정

#### 1.1 Supabase Project 생성
1. https://supabase.com 접속
2. 새 프로젝트 생성
3. Database Password 기록

#### 1.2 pgvector Extension 활성화 및 스키마 생성

Supabase SQL Editor에서 `supabase-schema.sql` 파일 실행:

```bash
# 로컬에서 복사
cat supabase-schema.sql
```

Supabase Dashboard → SQL Editor → New query → 붙여넣기 → Run

**생성되는 것:**
- `embeddings` 테이블 (벡터 저장)
- `commit_states` 테이블 (폴링 상태)
- `match_embeddings()` 함수 (유사도 검색)
- RLS 정책 (보안)

#### 1.3 환경 변수 업데이트

`.env` 파일:
```bash
# 기존 (필수)
GITHUB_TOKEN=ghp_xxxxx
OPENAI_API_KEY=sk-proj-xxxxx
TARGET_REPO_OWNER=bongseoksa
TARGET_REPO_NAME=portfolio

# Supabase 추가 (필수)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**SUPABASE_SERVICE_ROLE_KEY 찾기:**
1. Supabase Dashboard → Settings → API
2. Project API keys → `service_role` secret 복사
3. ⚠️ **절대 GitHub에 커밋하지 마세요!**

---

### Step 2: 코드 마이그레이션

#### 2.1 Vector 저장 코드 변경

**Before (ChromaDB):**
```typescript
import { saveVectors } from "./vector_store/saveVectors.js";

await saveVectors(
    collectionName,
    items,
    { reset: true }
);
```

**After (Supabase):**
```typescript
import { saveVectorsSupabase } from "./vector_store/saveVectorsSupabase.js";

await saveVectorsSupabase(
    items,
    { reset: true, owner, repo }
);
```

#### 2.2 Vector 검색 코드 변경

**Before (ChromaDB):**
```typescript
import { searchVectors } from "./vector_store/searchVectors.js";

const results = await searchVectors(collectionName, query, topK);
```

**After (Supabase):**
```typescript
import { searchVectorsSupabase } from "./vector_store/searchVectorsSupabase.js";

const results = await searchVectorsSupabase(query, topK, {
    threshold: 0.7,
    filterMetadata: { owner, repo }
});
```

#### 2.3 Polling 서비스 변경

**Before (파일 기반):**
```typescript
import { RepositoryPoller } from "./services/repositoryPoller.js";

const poller = new RepositoryPoller();
const results = await poller.pollAll();
poller.markAsProcessed(result);
```

**After (Supabase 기반):**
```typescript
import { RepositoryPollerSupabase } from "./services/repositoryPollerSupabase.js";

const poller = new RepositoryPollerSupabase();
const results = await poller.pollAll();
await poller.markAsProcessed(result);
```

---

### Step 3: 기존 데이터 마이그레이션 (선택)

#### 3.1 ChromaDB 데이터 내보내기

```typescript
// scripts/export-chromadb.ts
import { ChromaClient } from "chromadb";

const client = new ChromaClient({ path: "http://localhost:8000" });
const collection = await client.getCollection({ name: "portfolio-vectors" });

const allData = await collection.get({
    include: ["embeddings", "metadatas", "documents"]
});

// JSON으로 저장
fs.writeFileSync('chromadb-export.json', JSON.stringify(allData));
```

#### 3.2 Supabase로 가져오기

```typescript
// scripts/import-to-supabase.ts
import { SupabaseVectorStore } from "./src/vector_store/supabaseVectorStore.js";

const exportData = JSON.parse(fs.readFileSync('chromadb-export.json'));
const vectorStore = new SupabaseVectorStore();

const items = exportData.ids.map((id, idx) => ({
    id,
    content: exportData.documents[idx],
    embedding: exportData.embeddings[idx],
    metadata: exportData.metadatas[idx]
}));

await vectorStore.saveEmbeddings(items);
```

---

### Step 4: 테스트

#### 4.1 Supabase 연결 테스트

```bash
# 환경 변수 확인
pnpm tsx -e "
import { SupabaseVectorStore } from './src/vector_store/supabaseVectorStore.js';
const store = new SupabaseVectorStore();
const healthy = await store.healthCheck();
console.log('Supabase health:', healthy);
"
```

#### 4.2 전체 파이프라인 테스트

```bash
# 1. 기존 ChromaDB 서버 중지
pkill -f chroma

# 2. Supabase 기반 파이프라인 실행
pnpm run dev

# 예상 출력:
# ✅ All embeddings saved to Supabase
# ✅ Updated commit state for bongseoksa/portfolio
```

#### 4.3 검색 테스트

```bash
pnpm run ask "이 프로젝트의 기술 스택은?"

# 예상 출력:
# 🔍 Searching Supabase Vector Store for: "이 프로젝트의 기술 스택은?"
# ✅ Found 5 results
```

---

## 🔄 Rollback 방법

마이그레이션 실패 시 롤백:

1. **환경 변수 복원**
   ```bash
   # SUPABASE_* 변수 주석 처리
   ```

2. **기존 코드 사용**
   ```typescript
   // Supabase → ChromaDB로 복원
   import { saveVectors } from "./vector_store/saveVectors.js";
   import { RepositoryPoller } from "./services/repositoryPoller.js";
   ```

3. **ChromaDB 재시작**
   ```bash
   pnpm run chroma:start
   ```

---

## 📊 성능 비교

| 항목 | ChromaDB (로컬) | Supabase Vector (Cloud) |
|------|----------------|-------------------------|
| **Cold Start** | 0ms (항상 실행 중) | ~100-300ms (첫 연결) |
| **검색 속도** | ~50-100ms | ~100-200ms |
| **저장 속도** | ~200-500ms | ~300-800ms (네트워크) |
| **확장성** | 로컬 제한 | 무제한 (Cloud) |
| **가용성** | 로컬 의존 | 99.9% SLA |
| **Serverless** | ❌ 불가 | ✅ 완벽 호환 |

---

## 🔒 보안 고려사항

### 1. Service Role Key 보호

```bash
# ❌ 절대 커밋하지 마세요
git add .env  # 금지!

# ✅ .gitignore 확인
cat .gitignore | grep .env
```

### 2. Row Level Security (RLS)

Supabase 테이블에 RLS가 활성화되어 있습니다:
- 읽기: 모두 허용
- 쓰기: 인증된 사용자만

```sql
-- RLS 정책 확인
SELECT * FROM pg_policies WHERE tablename IN ('embeddings', 'commit_states');
```

### 3. API Key 로테이션

정기적으로 키 갱신:
1. Supabase Dashboard → Settings → API
2. Reset service_role key
3. `.env` 업데이트
4. Vercel/GitHub Secrets 업데이트

---

## 🐛 트러블슈팅

### 문제 1: "Failed to connect to Supabase"

**원인**: 잘못된 URL 또는 Key

**해결**:
```bash
# 환경 변수 확인
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Supabase Dashboard에서 재확인
# Settings → API → URL, service_role key
```

### 문제 2: "pgvector extension not found"

**원인**: Extension 미설치

**해결**:
```sql
-- Supabase SQL Editor에서 실행
CREATE EXTENSION IF NOT EXISTS vector;
```

### 문제 3: "Dimension mismatch"

**원인**: OpenAI (1536) vs Chroma (다른 차원)

**해결**:
```bash
# 스키마에서 차원 확인
# embeddings 테이블: vector(1536)

# OpenAI만 사용하도록 설정
# OPENAI_API_KEY 필수
```

### 문제 4: "Too many connections"

**원인**: Connection pool 부족

**해결**:
```typescript
// SupabaseVectorStore에서 연결 재사용
let supabaseClient: SupabaseClient | null = null;

function getClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}
```

---

## 📈 다음 단계

### Phase 2: API 서버 Serverless화

1. Express → Vercel Functions
2. CORS, Routing 이전
3. Health check 업데이트

### Phase 3: GitHub Actions 최적화

1. Artifact 저장 제거 (Supabase 사용)
2. Cache 전략 개선
3. 병렬 처리

---

## ✅ 마이그레이션 체크리스트

- [ ] Supabase Project 생성
- [ ] pgvector Extension 활성화
- [ ] `supabase-schema.sql` 실행
- [ ] 환경 변수 설정 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- [ ] 코드 마이그레이션 (saveVectors, searchVectors, RepositoryPoller)
- [ ] 테스트 (연결, 저장, 검색)
- [ ] 기존 ChromaDB 데이터 마이그레이션 (선택)
- [ ] 프로덕션 배포
- [ ] ChromaDB 서버 제거

---

## 📚 참고 자료

- [Supabase Vector Docs](https://supabase.com/docs/guides/ai/vector-columns)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
