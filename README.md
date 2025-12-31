# GitHub Analyzer

GitHub 레포지토리를 분석하여 코드와 커밋 히스토리를 NLP 기반 질의응답 시스템으로 제공하는 도구입니다.

---

## 🚀 빠른 시작

### 사전 요구사항

- Node.js 18.x 이상
- pnpm 패키지 매니저

### 설치 및 실행

```bash
# 1. 의존성 설치
pnpm install
cd frontend && pnpm install && cd ..

# 2. 환경 변수 설정 (.env 파일 생성)
GITHUB_TOKEN=ghp_xxx
TARGET_REPO_OWNER=username
TARGET_REPO_NAME=repo-name
OPENAI_API_KEY=sk-proj-xxx

# 파일 기반 벡터 검색 (Serverless - 권장)
VECTOR_FILE_URL=https://your-cdn.com/embeddings.json.gz

# 3. 백엔드 실행
pnpm run server
# → http://localhost:3001

# 4. 프론트엔드 실행 (별도 터미널)
cd frontend && pnpm run dev
# → http://localhost:5173
```

---

## 📐 아키텍처

### Vector Storage Modes (우선순위: File > Supabase > ChromaDB)

**1. File-Based (Serverless - 프로덕션 권장)** 🌟
- 비용: $0/월 (vs ChromaDB $20-50/월)
- 서버리스 호환 (Vercel, Lambda)
- Cold start: 150-380ms, Warm start: 51-151ms
- 활성화: `VECTOR_FILE_URL` 환경 변수

**2. Supabase pgvector (클라우드)**
- 비용: $25-30/월
- 읽기/쓰기 지원
- 활성화: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

**3. ChromaDB (로컬 개발 / CI 전용)**
- 무료 (로컬 개발용)
- CI에서만 사용 (임베딩 생성 단계)
- 활성화: 파일/Supabase 미설정 시 자동 fallback

### 핵심 설계 판단

**1. ChromaDB를 CI에서만 사용하는 이유**
> ChromaDB는 24/7 서버 운영이 필요한 stateful 서비스인데, 우리 시스템은 읽기 전용 Q&A이고 임베딩 생성은 코드 변경 시에만 발생하므로 CI에서 배치 처리하는 것이 비용과 복잡도 측면에서 효율적입니다.

**2. 런타임에서 파일 기반 검색을 사용하는 이유**
> 정적 JSON 파일을 CDN에서 다운로드하여 메모리에 캐싱하고 브루트포스 검색을 수행합니다. 벡터 수가 1,000개 이하일 때는 ChromaDB와 비슷한 성능(51-151ms)을 보이면서도 서버 비용을 $0으로 유지할 수 있습니다.

**3. 서버리스에서 히스토리를 벡터로 관리하는 방식**
> Q&A 히스토리를 질문/답변별로 임베딩하여 별도 JSON 파일로 저장하고, 다음 질의 시 코드 벡터와 함께 검색 대상에 포함합니다. Atomic Write 전략과 Hybrid Pruning으로 동시성 문제와 무한 증가를 방지합니다.

**4. 비용을 0원으로 유지한 방법**
> 벡터 데이터베이스 서버를 완전히 제거하고, 정적 JSON 파일을 CDN에 저장하여 Serverless 함수에서 직접 다운로드합니다. 임베딩 생성은 GitHub Actions(무료)에서 주기적으로 실행하고, 파일은 Vercel Blob Storage(무료 tier)에 저장합니다.

**상세 설명**: [docs/architecture/DESIGN-RATIONALE.md](docs/architecture/DESIGN-RATIONALE.md)

### 시스템 구조

```
┌─────────────────────────────────────────────────────┐
│              Frontend (:5173)                       │
│  Q&A Page  |  Dashboard  |  Settings               │
└───────────────────┬─────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ API      │ │ Supabase │ │   CDN    │
│ Server   │ │ (Cloud)  │ │(Vercel   │
│ :3001    │ │ History  │ │ Blob)    │
└──────────┘ └──────────┘ └──────────┘
     │
     │ (로컬 개발 시)
     ▼
┌──────────┐
│ ChromaDB │
│  :8000   │
└──────────┘
```

---

## ⚙️ 환경 변수

```env
# GitHub 레포지토리 (필수)
GITHUB_TOKEN=ghp_xxx
TARGET_REPO_OWNER=username
TARGET_REPO_NAME=repo-name

# AI API (최소 1개 필수)
OPENAI_API_KEY=sk-proj-xxx
CLAUDE_API_KEY=sk-ant-xxx  # OpenAI 실패 시 fallback

# 벡터 저장소 (아래 중 1개 선택)
VECTOR_FILE_URL=https://xxx.vercel-storage.com/embeddings.json.gz  # 권장
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
CHROMA_HOST=localhost  # 로컬 개발용
CHROMA_PORT=8000
```

---

## 🛠️ 주요 명령어

### 백엔드

```bash
# 데이터 수집 및 임베딩
pnpm run dev                    # 전체 파이프라인 실행
pnpm run dev --reset            # 벡터 컬렉션 리셋 후 실행

# 임베딩 내보내기 (Serverless 배포용)
pnpm tsx scripts/export-embeddings.ts --source supabase --upload vercel

# 서버 실행
pnpm run server                 # API 서버 (:3001)
pnpm run chroma:start           # ChromaDB (:8000) - 로컬 개발 시

# CLI 질의응답
pnpm run ask "질문"             # File/Supabase 모드는 서버 불필요
```

### 프론트엔드

```bash
cd frontend
pnpm run dev      # 개발 서버 (:5173)
pnpm run build    # 프로덕션 빌드
```

---

## 🎯 기술 스택

**백엔드**
- Node.js + TypeScript + Express
- Vector Storage: File-based / Supabase pgvector / ChromaDB
- Embeddings: OpenAI text-embedding-3-small
- LLM: OpenAI GPT-4o (primary) / Claude Sonnet 4 (fallback)

**프론트엔드**
- React 19 + TypeScript + Vite
- State: Jotai + TanStack Query
- Styling: PandaCSS
- Charts: Recharts

**인프라**
- Storage: Supabase (Q&A history), Vercel Blob (embeddings)
- Deployment: Vercel (Serverless)

---

## 📊 API 엔드포인트

### API Server (:3001)

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/ask` | POST | 질의응답 (question 필드) |
| `/api/history` | GET | 질문 이력 조회 |
| `/api/health` | GET | 서버 상태 확인 |
| `/api/dashboard/summary` | GET | 대시보드 통계 |

---

## 🔧 벡터 저장소 설정

### 옵션 1: File-based (권장)

```bash
# 1. Supabase에서 임베딩 내보내기
pnpm tsx scripts/export-embeddings.ts --source supabase --upload vercel

# 2. 출력된 URL을 .env에 설정
VECTOR_FILE_URL=https://xxx.vercel-storage.com/embeddings.json.gz
```

상세 가이드: [docs/architecture/FILE-BASED-VECTOR-STORE.md](docs/architecture/FILE-BASED-VECTOR-STORE.md)

### 옵션 2: Supabase

`.env`에 설정만 추가하면 자동 사용:
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### 옵션 3: ChromaDB (로컬)

```bash
pnpm run chroma:setup   # 최초 1회 설치
pnpm run chroma:start   # 서버 실행
```

---

## 🐛 트러블슈팅

### "Found 0 relevant documents"

임베딩 차원 불일치 시:
```bash
pnpm run reindex
```

### "답변을 생성할 수 없습니다"

API 키 확인:
```bash
cat .env | grep -E "OPENAI_API_KEY|CLAUDE_API_KEY"
```

최소 1개의 API 키 필요 (OpenAI 또는 Claude)

### zsh glob 오류

물음표(`?`), 별표(`*`) 포함 시 따옴표 필수:
```bash
pnpm run ask "차트는 뭐로 만들어졌어?"  # ✅
pnpm run ask 차트는 뭐로 만들어졌어?   # ❌
```

---

## 📝 프로젝트 상세 문서

- **전체 가이드**: [CLAUDE.md](CLAUDE.md)
- **설계 판단 설명**: [docs/architecture/DESIGN-RATIONALE.md](docs/architecture/DESIGN-RATIONALE.md) ⭐
- **파일 기반 벡터 스토어**: [docs/architecture/FILE-BASED-VECTOR-STORE.md](docs/architecture/FILE-BASED-VECTOR-STORE.md)
- **Serverless API 흐름**: [docs/architecture/VERCEL-ASK-API-FLOW.md](docs/architecture/VERCEL-ASK-API-FLOW.md)
- **Q&A 히스토리 벡터 관리**: [docs/architecture/QA-HISTORY-VECTOR-MANAGEMENT.md](docs/architecture/QA-HISTORY-VECTOR-MANAGEMENT.md)
- **추가 문서**: [docs/](docs/) 디렉토리

---

## 📄 라이선스

ISC License
