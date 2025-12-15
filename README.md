# GitHub Analyzer

GitHub repositories를 분석하여 코드와 커밋 히스토리 정보를 추출하고, NLP 기반 질의응답 시스템을 제공하는 도구입니다.

## 프로젝트 구조 (Project Structure)

```bash
NLP-portfolio/
├── src/                              # 백엔드 소스 코드
│   ├── index.ts                      # CLI 진입점 (명령어 처리)
│   ├── server/                       # API 서버 (Express.js)
│   │   ├── index.ts                  # 서버 진입점 (:3001)
│   │   ├── routes/
│   │   │   ├── ask.ts                # POST /api/ask - 질의응답
│   │   │   ├── health.ts             # GET /api/health - 헬스체크
│   │   │   └── history.ts            # GET /api/history - 이력 조회
│   │   └── services/
│   │       └── supabase.ts           # Supabase 클라이언트
│   ├── control/                      # Control 서버 (로컬 개발용)
│   │   ├── index.ts                  # 서버 진입점 (:3000)
│   │   └── processManager.ts         # 프로세스 시작/종료 관리
│   ├── data_sources/                 # 데이터 수집 계층
│   │   ├── github/                   # GitHub API 연동
│   │   │   ├── fetchCommit.ts        # 커밋 목록 수집
│   │   │   └── fetchFiles.ts         # 커밋별 변경 파일 조회
│   │   └── git/                      # 로컬 Git 분석
│   │       ├── parseLog.ts           # git log 파싱
│   │       └── extractDiff.ts        # 커밋별 diff 추출
│   ├── models/                       # TypeScript 타입 정의
│   ├── nlp/embedding/                # 임베딩 생성 (OpenAI/Chroma fallback)
│   ├── pipeline/                     # 데이터 처리 파이프라인
│   ├── qa/                           # LLM 답변 생성 (OpenAI/Claude fallback)
│   └── vector_store/                 # ChromaDB 벡터 저장/검색
│
├── frontend/                         # 프론트엔드 (React + TypeScript)
│   ├── src/
│   │   ├── api/                      # API 클라이언트
│   │   │   ├── client.ts             # 백엔드 API 통신
│   │   │   └── supabase.ts           # Supabase 클라이언트
│   │   ├── components/               # React 컴포넌트
│   │   │   ├── common/               # 공통 UI 컴포넌트
│   │   │   │   └── ServerStatus.tsx  # 헤더 서버 상태 인디케이터
│   │   │   ├── qa/                   # Q&A 관련 컴포넌트
│   │   │   └── dashboard/            # 대시보드 관련 컴포넌트
│   │   ├── hooks/                    # Custom Hooks
│   │   │   └── useQueries.ts         # TanStack Query 훅
│   │   ├── pages/                    # 페이지 컴포넌트
│   │   │   ├── QAPage.tsx            # Q&A 페이지 (ChatGPT 스타일)
│   │   │   ├── DashboardPage.tsx     # 모니터링 대시보드
│   │   │   └── SettingsPage.tsx      # 설정 페이지 (서버 제어)
│   │   ├── stores/                   # 상태 관리
│   │   │   └── uiStore.ts            # Jotai UI 상태
│   │   ├── types/                    # TypeScript 타입
│   │   │   └── index.ts              # 공통 타입 정의
│   │   ├── App.tsx                   # 앱 루트 (라우팅)
│   │   └── main.tsx                  # 진입점 (프로바이더 설정)
│   ├── styled-system/                # PandaCSS 생성 파일
│   ├── panda.config.ts               # PandaCSS 설정
│   └── package.json                  # 프론트엔드 의존성
│
├── supabase/                         # Supabase 설정
│   └── schema.sql                    # 데이터베이스 스키마
├── scripts/                          # 실행 스크립트
│   ├── setup_chroma.sh               # ChromaDB 설치
│   └── run_chroma.sh                 # ChromaDB 서버 실행
├── output/                           # 파이프라인 출력 결과
├── chroma_data/                      # ChromaDB 데이터
├── .chroma_venv/                     # ChromaDB Python 가상환경
├── .env                              # 환경 변수 (API 키 등)
├── package.json                      # 루트 의존성
└── README.md                         # 프로젝트 문서
```

---

## 아키텍처 (Architecture)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (Vercel)                            │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                       │
│  │  Q&A Page │  │ Dashboard │  │ Settings  │                       │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                       │
│        │              │              │                              │
│        └──────────────┼──────────────┘                              │
│                       │                                             │
└───────────────────────┼─────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐
│ API Server   │ │  Supabase   │ │Control Server│
│  :3001       │ │  (Cloud)    │ │  :3000       │
│              │ │             │ │ (Local Only) │
│ - /api/ask   │ │ - qa_history│ │              │
│ - /api/health│ │ - logs      │ │ - 서버 시작  │
│ - /api/hist. │ │             │ │ - 서버 종료  │
└──────┬───────┘ └─────────────┘ └──────┬───────┘
       │                                │
       │         ┌──────────────────────┘
       │         │
       ▼         ▼
┌──────────────────────┐
│     ChromaDB :8000   │
│   (Vector Database)  │
└──────────────────────┘
```

**환경별 동작:**
- **로컬 개발**: Control 서버로 ChromaDB/API 서버 시작/종료 가능
- **프로덕션 (Vercel)**: Supabase에서 이력 조회만, 서버 제어 비활성화

---

## 빠른 시작 가이드 (Quick Start)

### 사전 요구사항

- **Node.js** 18.x 이상
- **pnpm** 패키지 매니저
- **Python** 3.9 ~ 3.12 (ChromaDB용)
- **Git** (분석 대상 레포지토리 클론용)

### Step 1: 프로젝트 클론 및 의존성 설치

```bash
# 1. 프로젝트 클론
git clone https://github.com/your-username/NLP-portfolio.git
cd NLP-portfolio

# 2. 백엔드 의존성 설치
pnpm install

# 3. 프론트엔드 의존성 설치
cd frontend && pnpm install && cd ..
```

### Step 2: 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성합니다:

```env
# ========================================
# 필수 설정: 분석 대상 GitHub 레포지토리
# ========================================
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxx        # GitHub Personal Access Token
TARGET_REPO_OWNER=your-github-username   # 레포지토리 소유자
TARGET_REPO_NAME=your-repo-name          # 레포지토리 이름
LOCAL_REPO_PATH=/path/to/local/clone     # 로컬에 클론된 레포지토리 경로

# ========================================
# 선택 설정: AI API 키 (둘 중 하나만 있어도 동작)
# ========================================
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxx  # OpenAI API (없으면 Chroma 기본 임베딩 사용)
CLAUDE_API_KEY=sk-ant-xxxxxxxxxxxxxxxx   # Claude API (OpenAI 실패 시 fallback)

# ========================================
# 선택 설정: Supabase (이력 저장용)
# ========================================
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### Step 3: Supabase 설정 (선택)

질의응답 이력을 저장하려면 Supabase 프로젝트를 생성하고 스키마를 적용합니다:

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 실행
3. `.env`에 URL과 anon key 추가

### Step 4: ChromaDB 설정 및 실행

```bash
# 1. ChromaDB 설치 (최초 1회)
pnpm run chroma:setup

# 2. ChromaDB 서버 실행 (새 터미널에서)
pnpm run chroma:start
```

### Step 5: 데이터 수집 및 임베딩 생성

```bash
# 파이프라인 실행 (GitHub 데이터 수집 → 정제 → 임베딩 → 저장)
pnpm run dev
```

### Step 6: 백엔드 서버 실행

백엔드를 정상적으로 실행하려면 **3개의 서버가 모두 실행**되어야 합니다:

#### 필수 실행 서버

1. **ChromaDB 서버** (포트 8000)
   - **역할**: 벡터 데이터베이스 서버
   - **관리**: 벡터 임베딩 저장 및 검색
   - **실행**: `pnpm run chroma:start`
   - **설명**: 질의응답 시 관련 코드/커밋을 검색하기 위한 벡터 DB

2. **Control 서버** (포트 3000)
   - **역할**: 서버 관리 서버 (로컬 개발용)
   - **관리**: ChromaDB 및 API 서버의 시작/종료 제어
   - **실행**: `pnpm run control`
   - **설명**: 프론트엔드에서 서버 상태 확인 및 제어를 위한 관리 서버

3. **API 서버** (포트 3001)
   - **역할**: 메인 애플리케이션 서버
   - **관리**: 질의응답 API, 대시보드 통계, 이력 조회 등
   - **실행**: `pnpm run server`
   - **설명**: 프론트엔드와 통신하는 메인 API 엔드포인트 제공

#### 실행 방법

**방법 1: 각각 별도 터미널에서 실행 (권장)**

```bash
# 터미널 1: ChromaDB 서버
pnpm run chroma:start
# → ChromaDB running on http://localhost:8000

# 터미널 2: Control 서버
pnpm run control
# → Control Server running on http://localhost:3000

# 터미널 3: API 서버
pnpm run server
# → API Server running on http://localhost:3001

# 터미널 4: 프론트엔드
cd frontend && pnpm run dev
# → Frontend running on http://localhost:5173
```

**방법 2: Control + API 서버 동시 실행**

```bash
# 터미널 1: ChromaDB 서버
pnpm run chroma:start

# 터미널 2: Control + API 서버 동시 실행
pnpm run start:local
# → Control Server + API Server 동시 실행

# 터미널 3: 프론트엔드
cd frontend && pnpm run dev
```

**방법 3: CLI 모드 (간단, 웹 UI 없음)**

```bash
# ChromaDB만 실행하고
pnpm run chroma:start

# 다른 터미널에서 CLI로 질문
pnpm run ask "이 프로젝트에서 사용하는 기술스택은?"
```

#### 서버 실행 순서

1. **ChromaDB 먼저 실행** (포트 8000)
   - 벡터 데이터베이스가 없으면 질의응답이 불가능합니다
   - `pnpm run chroma:start` 실행

2. **Control 서버 실행** (포트 3000)
   - 프론트엔드에서 서버 상태 확인 및 제어를 위해 필요
   - `pnpm run control` 실행

3. **API 서버 실행** (포트 3001)
   - 질의응답, 대시보드 등 메인 기능 제공
   - `pnpm run server` 실행

4. **프론트엔드 실행** (포트 5173)
   - 웹 UI 접근
   - `cd frontend && pnpm run dev` 실행

**⚠️ 중요**: 
- ChromaDB는 반드시 먼저 실행해야 합니다
- Control 서버와 API 서버는 순서에 관계없이 실행 가능하지만, 둘 다 실행되어야 정상 동작합니다
- 프론트엔드는 마지막에 실행합니다

---

## 최종 동작 프로세스 (System Flow)

### 전체 시스템 동작 흐름

```
1. 사용자 질문 입력
   ↓
2. 프론트엔드 (포트 5173)
   - Q&A 페이지에서 질문 입력
   - API 서버로 POST /api/ask 요청
   ↓
3. API 서버 (포트 3001)
   - 질문을 받아 임베딩 생성 (OpenAI 또는 Chroma 기본)
   - ChromaDB에 벡터 검색 요청
   ↓
4. ChromaDB 서버 (포트 8000)
   - 벡터 검색 수행
   - 관련 코드/커밋 정보 반환
   ↓
5. API 서버 (포트 3001)
   - 검색 결과를 LLM에 전달 (OpenAI 또는 Claude)
   - 답변 생성 및 근거 정보 포함
   - Supabase에 이력 저장
   ↓
6. 프론트엔드 (포트 5173)
   - 답변 표시
   - 근거 정보 (소스 파일, 커밋) 표시
   - 질문 이력 업데이트
```

### 서버 간 통신 흐름

```
┌─────────────────────────────────────────────────────────────┐
│                    프론트엔드 (포트 5173)                    │
│  - Q&A 페이지: API 서버와 통신                               │
│  - Dashboard: API 서버와 통신                                │
│  - Settings: Control 서버와 통신 (로컬만)                     │
└─────────────────┬───────────────────┬───────────────────────┘
                  │                   │
        ┌─────────▼─────────┐  ┌─────▼──────────┐
        │  API 서버 (3001)   │  │Control 서버(3000)│
        │  - 질의응답 처리   │  │  - 서버 관리     │
        │  - 이력 조회       │  │  - 상태 확인     │
        │  - 통계 제공       │  └─────┬──────────┘
        └─────────┬─────────┘        │
                  │                   │
        ┌─────────▼─────────┐  ┌─────▼──────────┐
        │ ChromaDB (8000)   │  │  Supabase      │
        │  - 벡터 검색       │  │  - 이력 저장    │
        │  - 임베딩 저장     │  │  - 통계 저장    │
        └───────────────────┘  └────────────────┘
```

### 상태 확인 프로세스

1. **프론트엔드 → Control 서버** (로컬만)
   - `GET /control/status`: 모든 서버 상태 조회
   - Control 서버가 ChromaDB와 API 서버의 실제 HTTP 응답 확인
   - 1분 캐시 적용

2. **프론트엔드 → API 서버**
   - `GET /api/health`: API 서버 및 Supabase 상태 확인
   - `GET /api/health/chromadb`: ChromaDB 상태 확인 (포트 8000)
   - 1분 캐시 적용

3. **Control 서버 → ChromaDB/API 서버**
   - 실제 HTTP 요청으로 서버 응답 확인
   - 포트가 열려있고 응답이 있으면 `running` 상태로 표시

### 서버 시작/종료 프로세스

1. **ChromaDB 시작** (`POST /control/chromadb/start`)
   - Control 서버가 ChromaDB 프로세스 시작
   - 포트 8000에서 응답 확인
   - 상태를 `running`으로 업데이트

2. **API 서버 시작** (`POST /control/api/start`)
   - Control 서버가 API 서버 프로세스 시작
   - 포트 3001에서 응답 확인
   - 상태를 `running`으로 업데이트

3. **서버 종료** (`POST /control/chromadb/stop`, `/control/api/stop`)
   - 프로세스 종료
   - 상태를 `stopped`로 업데이트
   - 캐시 무효화

### 캐싱 전략

- **프론트엔드**: 상태 조회 결과 1분 캐시, 중복 요청 방지
- **백엔드**: Supabase 연결 상태 1분 캐시, ChromaDB 상태 1분 캐시
- **서버 시작/종료 시**: 캐시 자동 무효화

---

## 프론트엔드 페이지 구성

### 1. Q&A 페이지 (`/`)

ChatGPT 스타일의 질의응답 인터페이스:

- **질문 입력**: 자연어로 프로젝트에 대해 질문
- **응답 표시**: 답변 + 질문 유형 분류 + 신뢰도 점수
- **근거 정보**: 참고한 소스 파일, 커밋 해시, 커밋 메시지
- **질문 이력**: 최근 질문 목록 (검색 가능)

### 2. 대시보드 페이지 (`/dashboard`)

시스템 모니터링 및 분석:

- **요약 정보**: 전체 질문 수, 성공률, 평균 응답 속도
- **서버 상태**: 온라인/오프라인, 마지막 응답 시간
- **차트**: 일별 질의 수, 질문 유형 분포

### 3. 설정 페이지 (`/settings`) ⭐ NEW

서버 상태 확인 및 제어:

- **서버 상태 카드**: ChromaDB, API Server 상태 표시
- **제어 버튼**: 서버 시작/종료 (로컬 환경에서만 활성화)
- **외부 서비스**: Supabase 연결 상태
- **환경 정보**: API URL, Supabase URL 확인

**환경별 동작:**
| 환경 | 서버 제어 | 상태 확인 |
|------|----------|----------|
| 로컬 개발 | ✅ 가능 | ✅ 가능 |
| 프로덕션 (Vercel) | ❌ 비활성화 | ✅ 가능 |

---

## 명령어 목록 (Commands)

### 백엔드 (루트)

| 명령어 | 설명 |
|--------|------|
| `pnpm run dev` | 전체 파이프라인 실행 |
| `pnpm run dev --reset` | 벡터 컬렉션 리셋 후 실행 |
| `pnpm run reindex` | 기존 데이터로 재임베딩 |
| `pnpm run ask "질문"` | CLI 질의응답 |
| `pnpm run chroma:setup` | ChromaDB 설치 |
| `pnpm run chroma:start` | ChromaDB 서버 실행 |
| `pnpm run server` | API 서버 실행 (:3001) |
| `pnpm run control` | Control 서버 실행 (:3000) |
| `pnpm run start:local` | Control + API 서버 동시 실행 |

**⚠️ zsh 사용 시 주의사항:**
- 물음표(`?`), 별표(`*`) 등 특수문자가 포함된 질문은 반드시 따옴표로 감싸주세요.
- 예: `pnpm run ask "차트는 뭐로 만들어졌어?"` ✅
- 예: `pnpm run ask 차트는 뭐로 만들어졌어?` ❌ (zsh glob 오류 발생)

### 프론트엔드 (`frontend/`)

| 명령어 | 설명 |
|--------|------|
| `pnpm run dev` | 개발 서버 실행 (:5173) |
| `pnpm run build` | 프로덕션 빌드 |
| `pnpm run preview` | 빌드 결과 미리보기 |

---

## API 엔드포인트

### API Server (:3001)

| 엔드포인트 | 메서드 | 설명 | 캐싱 |
|-----------|--------|------|------|
| `/api/health` | GET | 서버 상태 확인 (API 서버, Supabase) | 1분 |
| `/api/health/chromadb` | GET | ChromaDB 상태 확인 (포트 8000) | 1분 |
| `/api/ask` | POST | 질의응답 (question 필드 필요) | - |
| `/api/history` | GET | 질문 이력 조회 | - |
| `/api/dashboard/summary` | GET | 대시보드 통계 | - |
| `/api/dashboard/daily` | GET | 일별 통계 | - |
| `/api/dashboard/categories` | GET | 카테고리 분포 | - |
| `/api/dashboard/sources` | GET | 소스 기여도 | - |

### Control Server (:3000) - 로컬 전용

| 엔드포인트 | 메서드 | 설명 | 캐싱 |
|-----------|--------|------|------|
| `/control/status` | GET | 모든 서버 상태 (Control, ChromaDB, API) | 1분 |
| `/control/chromadb/start` | POST | ChromaDB 시작 | - |
| `/control/chromadb/stop` | POST | ChromaDB 종료 | - |
| `/control/api/start` | POST | API 서버 시작 | - |
| `/control/api/stop` | POST | API 서버 종료 | - |
| `/control/logs/:server` | GET | 서버 로그 조회 | - |

**참고**: 
- 상태 확인 엔드포인트는 1분 캐시를 사용하여 과도한 요청을 방지합니다
- 서버 시작/종료 시 캐시가 자동으로 무효화됩니다

---

## AI API Fallback 동작

| 기능 | 1순위 | 2순위 (Fallback) |
|------|-------|------------------|
| **임베딩 생성** | OpenAI (`text-embedding-3-small`) | Chroma 기본 임베딩 (로컬, 무료) |
| **답변 생성** | OpenAI (`gpt-4o`) | Claude (`claude-sonnet-4-20250514`) |

- API 키가 없거나 할당량 초과 시 자동으로 fallback으로 전환
- **API 키 없이도 Chroma 기본 임베딩으로 동작 가능**

---

## 트러블슈팅 (Troubleshooting)

### 문제: `chroma` 명령어를 찾지 못함

```bash
zsh: command not found: chroma
```

**해결**: 제공된 스크립트 사용
```bash
pnpm run chroma:start
```

### 문제: 검색 결과가 0건

```
→ Found 0 relevant documents.
```

**원인**: 임베딩 차원 불일치 (OpenAI ↔ Chroma 전환 시)

**해결**: 재임베딩 실행
```bash
pnpm run reindex
```

### 문제: ChromaDB 서버 버전 에러

```
ChromaServerError: KeyError('_type')
```

**해결**: ChromaDB 서버 업그레이드
```bash
source .chroma_venv/bin/activate
pip install "chromadb>=1.0.0" "posthog>=3.0.0,<4.0.0"
```

---

### 문제: zsh에서 `pnpm run ask` 명령어 오류

```
zsh: no matches found: 만들어졌어?
```

**원인**: zsh에서 물음표(`?`)가 glob 패턴으로 해석됨

**해결**: 질문을 따옴표로 감싸기
```bash
# ❌ 오류 발생
pnpm run ask 차트는 뭐로 만들어졌어?

# ✅ 올바른 사용법
pnpm run ask "차트는 뭐로 만들어졌어?"
# 또는
pnpm run ask '차트는 뭐로 만들어졌어?'
```

**참고**: 물음표(`?`), 별표(`*`), 대괄호(`[]`) 등 특수문자가 포함된 질문은 반드시 따옴표로 감싸주세요.

### 문제: Control 서버 연결 안됨

Settings 페이지에서 "Control 서버 연결 안됨" 표시

**해결**: Control 서버 실행
```bash
pnpm run control
```

---

## 진행 현황 (Progress)

- [x] 분석 대상 레포지토리 확정: React + Vite 기반 portfolio
- [x] TypeScript 기반 프로젝트 환경 구성
- [x] GitHub API + 로컬 Git 데이터 수집 파이프라인
- [x] NLP 입력용 데이터 정제
- [x] NLP 기반 질의응답 시스템 (임베딩 + 검색 + LLM)
- [x] 프론트엔드 프로젝트 구조 설계
- [x] 백엔드 API 서버 구현 (Express.js)
- [x] Control 서버 구현 (프로세스 관리)
- [x] 프론트엔드 설정 페이지 (서버 제어 UI)
- [x] 헤더 서버 상태 인디케이터
- [x] Supabase 연동 (이력 저장)
- [ ] Vercel 배포 설정

---

## 라이선스

ISC License
