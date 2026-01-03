# 데이터베이스 스키마 문서

> **문서 버전**: v1.1
> **최종 업데이트**: 2026-01-03
> **데이터베이스**: PostgreSQL 15 + pgvector

---

## 목차

1. [스키마 파일 구조](#1-스키마-파일-구조)
2. [테이블 개요](#2-테이블-개요)
3. [테이블 상세 설명](#3-테이블-상세-설명)
4. [벡터 검색 최적화](#4-벡터-검색-최적화)
5. [보안 정책](#5-보안-정책)

---

## 1. 스키마 파일 구조

스키마 파일은 테이블별로 분리되어 있습니다:

```
docs/03_database/
├── 00_Schema_Documentation.md    # 현재 문서
├── 00_tables/                     # 공통 초기화
│   └── 00_init.sql               # PostgreSQL extensions & common functions
├── qa_history/
│   └── 00_qa_history.sql         # Q&A 히스토리 테이블
├── embeddings/
│   └── 00_embeddings.sql         # 임베딩 벡터 테이블
├── ping/
│   └── 00_ping.sql               # Supabase ping 테이블
└── commit_state/
    └── 00_commit_state.sql       # 커밋 처리 상태 테이블
```

**실행 순서**:
```bash
# 1. 초기화 (extensions & functions) - 필수, 가장 먼저 실행
psql -f 00_tables/00_init.sql

# 2. 테이블 생성 (순서 무관)
psql -f qa_history/00_qa_history.sql
psql -f embeddings/00_embeddings.sql
psql -f ping/00_ping.sql
psql -f commit_state/00_commit_state.sql
```

---

## 2. 테이블 개요

| 테이블 | 용도 | 주요 용도 | 크기 예상 |
|--------|------|----------|----------|
| `qa_history` | 질의응답 원문 저장 | 사용자 Q&A 기록, 연속 질의응답 컨텍스트, 대시보드 통계 | 1,000+ rows |
| `embeddings` | 임베딩 벡터 임시 저장 | CI 단계 전용, 파일 export 소스 | 5,000+ rows |
| `ping` | Supabase 연결 상태 | Free Tier 유지 목적 | 100+ rows |
| `commit_state` | 커밋 처리 상태 | 증분 업데이트 (Artifacts 대체) | 2-10 rows |

---

## 3. 테이블 상세 설명

### 3.1 qa_history (질의응답 히스토리)

**파일**: [qa_history/00_qa_history.sql](qa_history/00_qa_history.sql)

**목적**: 사용자 질의응답 원문을 저장하여 연속 질의응답 컨텍스트 및 대시보드 통계 제공

**스키마**:
```sql
CREATE TABLE qa_history (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,

  -- Content
  question TEXT NOT NULL,
  question_summary TEXT,              -- NEW: 20자 이내 요약 (대시보드용)
  answer TEXT NOT NULL,

  -- Classification
  category TEXT,                      -- 12+ categories supported
  category_confidence NUMERIC(3, 2),  -- NEW: 0.00 ~ 1.00
  confidence NUMERIC(3, 2),           -- Deprecated

  -- Performance metrics
  response_time_ms INTEGER,           -- 전체 응답 시간 (대시보드 사용)
  processing_time_ms INTEGER,         -- Deprecated
  classification_time_ms INTEGER,     -- NEW: 카테고리 분류 시간
  vector_search_time_ms INTEGER,      -- NEW: 벡터 검색 시간
  llm_generation_time_ms INTEGER,     -- NEW: LLM 생성 시간
  db_save_time_ms INTEGER,            -- NEW: DB 저장 시간

  -- Token usage
  token_usage INTEGER,                -- 전체 토큰 사용량
  prompt_tokens INTEGER,              -- NEW
  completion_tokens INTEGER,          -- NEW
  embedding_tokens INTEGER,           -- NEW

  -- Metadata
  sources JSONB,                      -- [{type, content, score}]
  metadata JSONB,
  session_id TEXT,                    -- NEW: 대화 세션 ID

  -- Status
  status TEXT,                        -- 'success' | 'partial' | 'failed'
  llm_provider TEXT                   -- 'claude' | 'gemini' | 'openai'
);
```

**주요 변경사항 (v1.1)**:
1. `question_summary` 추가 - 대시보드 리스트 표시용 (20자 이내)
2. `category_confidence` 추가 - 카테고리 분류 정확도
3. 상세 시간 측정 필드 추가 - classification/vector_search/llm_generation/db_save
4. 상세 토큰 사용량 추가 - prompt/completion/embedding
5. `session_id` 추가 - 연속 대화 스레딩

**인덱스**:
- `idx_qa_history_created_at`: 최신 순 조회 최적화 (대시보드 일별 통계)
- `idx_qa_history_category`: 카테고리별 필터링 (대시보드 분포 차트)
- `idx_qa_history_status`: 성공률 집계
- `idx_qa_history_session_id`: 세션별 대화 조회
- `idx_qa_history_question_fts`: 전문 검색 (Full-Text Search)

**샘플 데이터**:
```json
{
  "id": "a1b2c3d4-...",
  "created_at": "2026-01-03T10:00:00Z",
  "question": "차트는 뭐로 만들어졌어?",
  "question_summary": "차트 라이브러리",
  "answer": "Recharts 라이브러리를 사용했습니다. DashboardPage.tsx에서 LineChart, PieChart, BarChart 컴포넌트를 활용하고 있습니다.",
  "category": "techStack",
  "category_confidence": 0.95,
  "response_time_ms": 1250,
  "classification_time_ms": 120,
  "vector_search_time_ms": 380,
  "llm_generation_time_ms": 720,
  "db_save_time_ms": 30,
  "token_usage": 485,
  "prompt_tokens": 320,
  "completion_tokens": 145,
  "embedding_tokens": 20,
  "sources": [
    {
      "type": "file",
      "path": "frontend/src/pages/DashboardPage.tsx",
      "score": 0.92
    }
  ],
  "status": "success",
  "llm_provider": "claude",
  "session_id": "sess-xyz123"
}
```

**지원 카테고리 (12+ types)**:
```typescript
// frontend/src/types/index.ts 참조
- planning       // 기획
- technical      // 기술
- history        // 히스토리
- cs             // CS (고객 서비스)
- status         // 현황
- issue          // 이슈/버그
- implementation // 구현
- structure      // 구조
- data           // 데이터
- techStack      // 기술스택
- testing        // 테스트
- summary        // 요약
- etc            // 기타
```

**사용 시나리오**:

1. **대시보드: 일별 통계 (최근 30일)**:
   ```sql
   SELECT
     DATE(created_at) AS date,
     COUNT(*) AS question_count,
     COUNT(*) FILTER (WHERE status = 'success') AS success_count,
     AVG(response_time_ms) AS average_response_time_ms
   FROM qa_history
   WHERE created_at >= NOW() - INTERVAL '30 days'
   GROUP BY DATE(created_at)
   ORDER BY date DESC;
   ```

2. **대시보드: 카테고리 분포**:
   ```sql
   SELECT
     category,
     COUNT(*) AS count,
     ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage
   FROM qa_history
   WHERE category IS NOT NULL
   GROUP BY category
   ORDER BY count DESC;
   ```

3. **대시보드: 최근 응답 속도 (Top 10)**:
   ```sql
   SELECT
     id,
     question_summary,
     question,
     response_time_ms,
     created_at
   FROM qa_history
   ORDER BY created_at DESC
   LIMIT 10;
   ```

4. **연속 질의응답 컨텍스트**:
   ```sql
   SELECT question, answer, created_at
   FROM qa_history
   WHERE session_id = 'sess-xyz123'
   ORDER BY created_at ASC;
   ```

---

### 3.2 embeddings (임베딩 벡터)

**파일**: [embeddings/00_embeddings.sql](embeddings/00_embeddings.sql)

**목적**: CI 단계에서 생성한 임베딩 벡터를 임시 저장하여 `embeddings.json.gz` export

**스키마**:
```sql
CREATE TABLE embeddings (
  id TEXT PRIMARY KEY,              -- "commit-{sha}" | "file-{sha}-{index}" | "qa-{id}"
  type TEXT NOT NULL,               -- 'commit' | 'file' | 'qa'
  content TEXT NOT NULL,
  embedding vector(384),            -- pgvector extension
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**벡터 차원**:
- **현재**: 384 dimensions (`sentence-transformers/all-MiniLM-L6-v2`)
- **이전**: 1536 dimensions (OpenAI `text-embedding-3-small`)

**메타데이터 구조 (type별)**:

#### type: "commit"
```json
{
  "type": "commit",
  "sha": "abc123def456",
  "author": "username",
  "date": "2026-01-01T12:00:00Z",
  "message": "feat: Add dark mode toggle",
  "fileCount": 3,
  "repository": "username/portfolio"
}
```

#### type: "file"
```json
{
  "type": "file",
  "path": "src/components/Header.tsx",
  "fileType": "src",
  "size": 1024,
  "extension": ".tsx",
  "sha": "xyz789",
  "chunkIndex": 0,
  "totalChunks": 1,
  "repository": "username/NLP-portfolio"
}
```

#### type: "qa"
```json
{
  "type": "qa",
  "qa_id": "a1b2c3d4-...",
  "category": "architecture",
  "created_at": "2026-01-03T10:00:00Z"
}
```

**벡터 검색**:
```sql
-- Cosine similarity 기반 Top-K 검색
SELECT
  id,
  type,
  content,
  metadata,
  1 - (embedding <=> $1::vector) AS similarity
FROM embeddings
WHERE type IN ('commit', 'file')
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

**주의사항**:
- 이 테이블은 **CI 단계 전용**
- 런타임에서는 `embeddings.json.gz` 파일 사용
- 주기적으로 export 후 데이터 정리 가능

---

### 3.3 ping (Supabase 연결 상태)

**파일**: [ping/00_ping.sql](ping/00_ping.sql)

**목적**: Supabase Free Tier 7일 비활성 방지 (GitHub Actions 주간 실행)

**스키마**:
```sql
CREATE TABLE ping (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,             -- 'success' | 'error'
  http_code INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  triggered_by TEXT                 -- 'github_actions'
);
```

**샘플 데이터**:
```json
{
  "id": "x1y2z3...",
  "created_at": "2026-01-03T15:00:00Z",
  "status": "success",
  "http_code": 200,
  "response_time_ms": 120,
  "error_message": null,
  "triggered_by": "github_actions"
}
```

**내장 함수**:
1. `cleanup_old_pings()` - 90일 이상 된 ping 기록 자동 삭제
2. `check_ping_health()` - 최근 7일 ping 상태 집계

**사용 시나리오**:
1. **최근 7일 연결 상태**:
   ```sql
   SELECT
     created_at,
     status,
     http_code,
     response_time_ms
   FROM ping
   WHERE created_at >= NOW() - INTERVAL '7 days'
   ORDER BY created_at DESC;
   ```

2. **Ping 건강 상태 확인**:
   ```sql
   SELECT * FROM check_ping_health();
   ```

---

### 3.4 commit_state (커밋 처리 상태)

**파일**: [commit_state/00_commit_state.sql](commit_state/00_commit_state.sql)

**목적**: 증분 업데이트를 위한 마지막 처리 커밋 SHA 저장 (GitHub Artifacts 대체)

**스키마**:
```sql
CREATE TABLE commit_state (
  id TEXT PRIMARY KEY,              -- "owner/repo"
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  last_processed_commit TEXT NOT NULL,
  last_processed_at TIMESTAMPTZ NOT NULL,
  total_commits_processed INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

**샘플 데이터**:
```json
{
  "id": "username/portfolio",
  "owner": "username",
  "repo": "portfolio",
  "default_branch": "master",
  "last_processed_commit": "abc123def456",
  "last_processed_at": "2026-01-01T15:00:00Z",
  "total_commits_processed": 150,
  "updated_at": "2026-01-01T15:10:00Z"
}
```

**사용 시나리오**:
1. **마지막 처리 커밋 조회**:
   ```sql
   SELECT last_processed_commit
   FROM commit_state
   WHERE id = 'username/portfolio';
   ```

2. **상태 업데이트 (UPSERT)**:
   ```sql
   INSERT INTO commit_state (id, owner, repo, last_processed_commit, last_processed_at, total_commits_processed)
   VALUES ('username/portfolio', 'username', 'portfolio', 'new-sha', NOW(), 151)
   ON CONFLICT (id)
   DO UPDATE SET
     last_processed_commit = EXCLUDED.last_processed_commit,
     last_processed_at = EXCLUDED.last_processed_at,
     total_commits_processed = EXCLUDED.total_commits_processed;
   ```

---

## 4. 벡터 검색 최적화

### 4.1 ivfflat 인덱스

```sql
CREATE INDEX idx_embeddings_vector
ON embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

**파라미터**:
- `lists = 100`: 클러스터 개수 (데이터 크기에 따라 조정)
- `vector_cosine_ops`: Cosine similarity 연산 최적화

**권장 사항**:
- 데이터 크기 < 1,000 rows: `lists = 10`
- 데이터 크기 1,000 ~ 10,000 rows: `lists = 100`
- 데이터 크기 10,000 ~ 100,000 rows: `lists = 1000`
- 데이터 크기 > 100,000 rows: `lists = 10000`

### 4.2 검색 성능

| 데이터 크기 | Full Scan | ivfflat Index | 성능 개선 |
|------------|-----------|---------------|----------|
| 1,000 rows | 50ms | 15ms | 3.3x |
| 5,000 rows | 250ms | 35ms | 7.1x |
| 10,000 rows | 500ms | 60ms | 8.3x |

### 4.3 벡터 연산자

| 연산자 | 의미 | 용도 |
|-------|------|------|
| `<=>` | Cosine distance | 유사도 검색 (추천) |
| `<->` | L2 distance | 유클리드 거리 |
| `<#>` | Inner product | 내적 |

---

## 5. 보안 정책

### 5.1 Row Level Security (RLS)

**qa_history**:
```sql
-- 읽기: 모든 사용자 (익명 포함)
CREATE POLICY "qa_history_select_policy"
ON qa_history FOR SELECT
USING (true);

-- 쓰기: 서비스 역할만
CREATE POLICY "qa_history_insert_policy"
ON qa_history FOR INSERT
WITH CHECK (auth.role() = 'service_role');
```

**embeddings, ping, commit_state**:
```sql
-- 모든 작업: 서비스 역할만
CREATE POLICY "embeddings_service_role_policy"
ON embeddings FOR ALL
USING (auth.role() = 'service_role');
```

### 5.2 API 키 권한

| 키 | 테이블 접근 권한 |
|---|----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | 전체 테이블 읽기/쓰기 |
| `SUPABASE_ANON_KEY` | `qa_history` 읽기 전용 |

---

## 📚 관련 문서

- SQL 스키마 파일:
  - [초기화 스크립트](./00_tables/00_init.sql)
  - [qa_history 테이블](./qa_history/00_qa_history.sql)
  - [embeddings 테이블](./embeddings/00_embeddings.sql)
  - [ping 테이블](./ping/00_ping.sql)
  - [commit_state 테이블](./commit_state/00_commit_state.sql)
- [시스템 아키텍처](../02_architecture/01_System_Architecture.md)
- [CI/CD 워크플로우](../04_ci-cd/01_Workflows.md)

---

## 변경 이력

### v1.1 (2026-01-03)
- 스키마 파일을 테이블별로 분리 (`tables/` 디렉토리)
- `qa_history` 테이블 필드 추가:
  - `question_summary` - 대시보드 리스트 표시용
  - `category_confidence` - 카테고리 분류 정확도
  - 상세 시간 측정 필드 (classification/vector_search/llm_generation/db_save)
  - 상세 토큰 사용량 (prompt/completion/embedding)
  - `session_id` - 연속 대화 스레딩
- 대시보드 요구사항 반영 (DashboardPage.tsx 분석)
- 12+ 카테고리 지원 문서화

### v1.0 (2026-01-03)
- 초기 버전 작성

---

**문서 작성 완료**: 2026-01-03 11:00 KST
