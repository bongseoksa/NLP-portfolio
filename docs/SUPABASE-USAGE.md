# Supabase Vector Store 사용 가이드

ChromaDB와 Supabase Vector Store를 모두 지원하는 하이브리드 모드로 전환되었습니다.

---

## 🎯 빠른 시작

### 1. Supabase 프로젝트 설정

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. SQL Editor에서 `supabase-schema.sql` 실행하여 스키마 생성
3. Project Settings → API에서 URL과 service_role key 확인

### 2. 환경 변수 추가

`.env` 파일에 다음 추가:

```bash
# 기존 환경 변수 (필수)
GITHUB_TOKEN=ghp_xxxxx
OPENAI_API_KEY=sk-proj-xxxxx
TARGET_REPO_OWNER=your-username
TARGET_REPO_NAME=your-repo

# Supabase 환경 변수 추가 (선택)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**⚠️ 중요**: `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 **모두 설정되어 있으면** 자동으로 Supabase 모드로 실행됩니다.

### 3. 실행

환경 변수만 설정하면 끝! 기존 명령어 그대로 사용하세요:

```bash
# ChromaDB 모드 (환경 변수 없음)
pnpm run dev

# Supabase 모드 (환경 변수 있음)
pnpm run dev  # 자동으로 Supabase 사용

# Q&A
pnpm run ask "프로젝트 설명해줘"
```

---

## 📊 자동 모드 전환

시스템은 환경 변수를 기반으로 자동으로 Vector Store를 선택합니다:

| 환경 변수 설정 | 사용되는 Vector Store |
|---------------|---------------------|
| `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY` **모두 있음** | **Supabase** (Cloud) |
| 위 변수가 하나라도 없음 | **ChromaDB** (Local) |

실행 시 콘솔에 어떤 모드로 실행되는지 표시됩니다:

```
📊 Vector Store: Supabase (Cloud)
📊 Commit State: Supabase Table
```

또는

```
📊 Vector Store: ChromaDB (Local)
```

---

## 🔧 사용 가능한 명령어

### 1. 데이터 파이프라인

```bash
# 일반 실행 (변경 감지)
pnpm run dev

# 전체 재임베딩 (reset 모드)
pnpm run dev --reset

# 기존 데이터로 재임베딩만
pnpm run reindex
```

**자동 동작**:
- Supabase 환경 변수가 있으면 → Supabase 사용
- 없으면 → ChromaDB 사용 (기존 방식)

### 2. Q&A (CLI)

```bash
pnpm run ask "이 프로젝트는 뭐야?"
```

**자동 동작**:
- Supabase 환경 변수가 있으면 → Supabase에서 검색
- 없으면 → ChromaDB에서 검색

### 3. API 서버

```bash
pnpm run server
```

**자동 동작**:
- `/api/ask` 엔드포인트가 환경 변수에 따라 자동으로 Supabase 또는 ChromaDB 사용

---

## 🔄 마이그레이션 시나리오

### 시나리오 1: ChromaDB → Supabase 전환

1. **Supabase 설정**
   ```bash
   # .env 파일 수정
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
   ```

2. **스키마 생성**
   - Supabase SQL Editor에서 `supabase-schema.sql` 실행

3. **데이터 마이그레이션**
   ```bash
   # 기존 ChromaDB 데이터로 Supabase에 재임베딩
   pnpm run reindex
   ```

4. **ChromaDB 서버 중지** (선택)
   ```bash
   pkill -f chroma
   ```

이제 자동으로 Supabase 모드로 실행됩니다!

### 시나리오 2: Supabase → ChromaDB 롤백

1. **환경 변수 제거**
   ```bash
   # .env에서 주석 처리
   # SUPABASE_URL=https://xxxxx.supabase.co
   # SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
   ```

2. **ChromaDB 서버 시작**
   ```bash
   pnpm run chroma:start
   ```

자동으로 ChromaDB 모드로 전환됩니다!

### 시나리오 3: 두 개 모두 유지 (A/B 테스트)

환경 변수를 켜고 끄면서 두 시스템을 비교할 수 있습니다:

```bash
# ChromaDB 테스트
# .env에서 SUPABASE_* 주석 처리
pnpm run ask "테스트 질문"

# Supabase 테스트
# .env에서 SUPABASE_* 주석 해제
pnpm run ask "테스트 질문"
```

---

## 🔍 상태 확인

### 현재 어떤 모드로 실행 중인지 확인

```bash
# 파이프라인 실행 시 첫 줄에 표시
pnpm run dev

# 출력 예시:
# 📊 Vector Store: Supabase (Cloud)  ← Supabase 모드
# 또는
# 📊 Vector Store: ChromaDB (Local)  ← ChromaDB 모드
```

### Supabase 연결 테스트

```bash
pnpm tsx -e "
import { SupabaseVectorStore } from './src/vector_store/supabaseVectorStore.js';
const store = new SupabaseVectorStore();
const healthy = await store.healthCheck();
console.log('Supabase health:', healthy);
"
```

### ChromaDB 연결 테스트

```bash
curl http://localhost:8000/api/v1/heartbeat
```

---

## 📈 성능 비교

| 항목 | ChromaDB (로컬) | Supabase Vector (클라우드) |
|------|-----------------|---------------------------|
| **Cold Start** | 0ms (항상 실행 중) | ~100-300ms |
| **검색 속도** | ~50-100ms | ~100-200ms |
| **저장 속도** | ~200-500ms | ~300-800ms (네트워크) |
| **확장성** | 로컬 제한 | 무제한 (Cloud) |
| **가용성** | 로컬 의존 | 99.9% SLA |
| **Serverless** | ❌ 불가 | ✅ 완벽 호환 |
| **설정 난이도** | 쉬움 (로컬 설치) | 중간 (클라우드 설정) |

---

## 🚨 트러블슈팅

### 1. "어떤 모드로 실행되는지 확실하지 않아요"

실행 시 첫 줄에 표시되는 메시지를 확인하세요:

```bash
pnpm run dev

# 출력:
📊 Vector Store: Supabase (Cloud)  # ← 이 줄 확인
```

또는 환경 변수를 직접 확인:

```bash
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

둘 다 값이 있으면 Supabase 모드입니다.

### 2. "Supabase 환경 변수가 있는데도 ChromaDB로 실행돼요"

**원인**: 환경 변수가 제대로 로드되지 않았습니다.

**해결**:
```bash
# 1. .env 파일 위치 확인 (프로젝트 루트에 있어야 함)
ls -la .env

# 2. 환경 변수 확인
node -e "require('dotenv').config(); console.log(process.env.SUPABASE_URL)"

# 3. 서버 재시작
# (nodemon 사용 시 자동 재시작 안될 수 있음)
```

### 3. "Supabase에 연결할 수 없어요"

**원인**: 잘못된 URL 또는 Key

**해결**:
```bash
# 1. Supabase Dashboard → Settings → API
# 2. URL 복사 (https://xxxxx.supabase.co)
# 3. service_role key 복사 (eyJhbGci...)
# 4. .env 파일 업데이트

# 5. 연결 테스트
pnpm tsx -e "
import { createClient } from '@supabase/supabase-js';
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await client.from('embeddings').select('count');
console.log('Result:', data, error);
"
```

### 4. "ChromaDB 모드로 돌아가고 싶어요"

**해결**:
```bash
# .env 파일에서 주석 처리
# SUPABASE_URL=https://xxxxx.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# ChromaDB 서버 시작
pnpm run chroma:start

# 실행
pnpm run dev  # 자동으로 ChromaDB 모드
```

### 5. "pgvector extension not found"

**원인**: Supabase에서 pgvector가 활성화되지 않았습니다.

**해결**:
```sql
-- Supabase SQL Editor에서 실행
CREATE EXTENSION IF NOT EXISTS vector;
```

또는 `supabase-schema.sql` 전체를 다시 실행하세요.

---

## ⚙️ 고급 설정

### 1. 프로그래매틱 모드 선택

환경 변수 대신 코드에서 직접 지정할 수도 있습니다:

```typescript
import { runPipeline } from './src/pipeline/runPipeline.js';

// Supabase 강제 사용
await runPipeline({ useSupabase: true });

// ChromaDB 강제 사용
await runPipeline({ useSupabase: false });
```

### 2. 특정 레포지토리만 Supabase에 저장

```typescript
import { saveVectorsSupabase } from './src/vector_store/saveVectorsSupabase.js';

await saveVectorsSupabase(items, {
    owner: 'specific-owner',
    repo: 'specific-repo',
    reset: true
});
```

### 3. 검색 필터링

Supabase는 메타데이터 필터를 지원합니다:

```typescript
import { searchVectorsSupabase } from './src/vector_store/searchVectorsSupabase.js';

const results = await searchVectorsSupabase("질문", 5, {
    threshold: 0.7,  // 유사도 임계값
    filterMetadata: {
        owner: 'bongseoksa',
        repo: 'portfolio',
        type: 'commit'  // 커밋만 검색
    }
});
```

---

## 🔐 보안 참고사항

### 1. Service Role Key 보호

```bash
# ❌ 절대 커밋하지 마세요
git add .env  # 금지!

# ✅ .gitignore 확인
cat .gitignore | grep .env
```

### 2. Row Level Security (RLS)

Supabase 테이블에는 RLS가 활성화되어 있습니다:
- **읽기**: 모두 허용
- **쓰기**: 인증된 사용자만 (service_role 또는 authenticated)

### 3. API Key 로테이션

정기적으로 키를 갱신하세요:
1. Supabase Dashboard → Settings → API → Reset service_role key
2. `.env` 파일 업데이트
3. Vercel/GitHub Secrets 업데이트 (배포 시)

---

## 📚 관련 문서

- [SERVERLESS-MIGRATION.md](./SERVERLESS-MIGRATION.md) - 상세 마이그레이션 가이드
- [supabase-schema.sql](./supabase-schema.sql) - 데이터베이스 스키마
- [Supabase Vector Docs](https://supabase.com/docs/guides/ai/vector-columns)
- [pgvector GitHub](https://github.com/pgvector/pgvector)

---

## ✅ 체크리스트

Supabase 모드를 사용하려면:

- [ ] Supabase 프로젝트 생성
- [ ] `supabase-schema.sql` 실행
- [ ] `.env`에 `SUPABASE_URL` 추가
- [ ] `.env`에 `SUPABASE_SERVICE_ROLE_KEY` 추가
- [ ] 환경 변수 로드 확인 (`echo $SUPABASE_URL`)
- [ ] 실행 시 "Supabase (Cloud)" 메시지 확인
- [ ] 첫 임베딩 실행 (`pnpm run dev`)
- [ ] Q&A 테스트 (`pnpm run ask "테스트"`)

ChromaDB 모드를 유지하려면:

- [ ] Supabase 환경 변수 **설정하지 않음** (또는 주석 처리)
- [ ] ChromaDB 서버 실행 중 (`pnpm run chroma:start`)
- [ ] 실행 시 "ChromaDB (Local)" 메시지 확인

---

**요약**: 환경 변수만 설정하면 자동으로 전환됩니다. 추가 코드 수정 불필요!
