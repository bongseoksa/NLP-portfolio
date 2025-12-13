# GitHub Analyzer

GitHub repositories를 분석하여 코드와 커밋 히스토리 정보를 추출하고, NLP 기반 질의응답 시스템을 제공하는 도구입니다.

## 프로젝트 구조 (Project Structure)

```bash
NLP-portfolio/
├── src/                              # 백엔드 소스 코드
│   ├── index.ts                      # CLI 진입점 (명령어 처리)
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
│   │   │   └── client.ts             # 백엔드 API 통신
│   │   ├── components/               # React 컴포넌트
│   │   │   ├── common/               # 공통 UI 컴포넌트
│   │   │   ├── qa/                   # Q&A 관련 컴포넌트
│   │   │   └── dashboard/            # 대시보드 관련 컴포넌트
│   │   ├── hooks/                    # Custom Hooks
│   │   │   └── useQueries.ts         # TanStack Query 훅
│   │   ├── pages/                    # 페이지 컴포넌트
│   │   │   ├── QAPage.tsx            # Q&A 페이지 (ChatGPT 스타일)
│   │   │   └── DashboardPage.tsx     # 모니터링 대시보드
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

## 빠른 시작 가이드 (Quick Start)

처음 프로젝트를 실행하는 분들을 위한 단계별 가이드입니다.

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
```

#### GitHub Token 발급 방법

1. [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens) 접속
2. **"Generate new token (classic)"** 클릭
3. 권한 선택: `repo` (Full control of private repositories)
4. 생성된 토큰을 `.env` 파일에 저장

### Step 3: 분석 대상 레포지토리 준비

```bash
# 분석할 레포지토리 클론
git clone https://github.com/your-username/portfolio.git ~/projects/portfolio

# .env의 LOCAL_REPO_PATH를 클론된 경로로 설정
```

### Step 4: ChromaDB 설정 및 실행

```bash
# 1. ChromaDB 설치 (최초 1회)
pnpm run chroma:setup

# 2. ChromaDB 서버 실행 (새 터미널에서)
pnpm run chroma:start
```

> ⚠️ **중요**: ChromaDB 서버는 별도 터미널에서 실행 상태를 유지해야 합니다.

### Step 5: 데이터 수집 및 임베딩 생성

```bash
# 파이프라인 실행 (GitHub 데이터 수집 → 정제 → 임베딩 → 저장)
pnpm run dev
```

### Step 6: 질의응답 실행 (CLI)

```bash
pnpm run ask "이 프로젝트에서 사용하는 기술스택은?"
```

### Step 7: 프론트엔드 실행 (선택)

```bash
cd frontend
pnpm run dev
# http://localhost:5173 에서 확인
```

---

## 프론트엔드 (Frontend)

### 기술 스택

| 구분 | 기술 |
|------|------|
| **프레임워크** | React 19 + TypeScript |
| **빌드 도구** | Vite 7 |
| **스타일링** | PandaCSS |
| **서버 상태** | TanStack Query (React Query) |
| **클라이언트 상태** | Jotai |
| **차트** | Recharts |
| **라우팅** | React Router v7 |

### 페이지 구성

#### 1. Q&A 페이지 (`/`)

ChatGPT 스타일의 질의응답 인터페이스:

- **질문 입력**: 자연어로 프로젝트에 대해 질문
- **응답 표시**: 답변 + 질문 유형 분류 + 신뢰도 점수
- **근거 정보**: 참고한 소스 파일, 커밋 해시, 커밋 메시지
- **질문 이력**: 최근 질문 목록 (검색 가능, 20자 요약)
- **응답 상태**: 정상/부분 응답/응답 실패 명확히 표시

#### 2. 대시보드 페이지 (`/dashboard`)

시스템 모니터링 및 분석:

- **요약 정보**: 전체 질문 수, 성공률, 평균 응답 속도, 토큰 사용량
- **서버 상태**: 온라인/오프라인, 마지막 응답 시간
- **차트**:
  - 일별 질의 수 (라인 그래프)
  - 질문 유형 분포 (도넛 차트)
  - 데이터 소스 기여도 (막대 그래프)
- **응답 속도 분석**: 개별 질문별 응답 시간

### 프론트엔드 실행

```bash
cd frontend

# 개발 서버 실행
pnpm run dev

# 프로덕션 빌드
pnpm run build

# 빌드 결과 미리보기
pnpm run preview
```

### 프론트엔드 디렉토리 구조

```bash
frontend/src/
├── api/
│   └── client.ts           # API 클라이언트 (fetch 래퍼)
├── components/
│   ├── common/             # Button, Card, Badge 등 공통 컴포넌트
│   ├── qa/                 # QuestionInput, AnswerCard, SourceList 등
│   └── dashboard/          # StatCard, Chart 컴포넌트
├── hooks/
│   └── useQueries.ts       # TanStack Query 커스텀 훅
├── pages/
│   ├── QAPage.tsx          # Q&A 메인 페이지
│   └── DashboardPage.tsx   # 대시보드 페이지
├── stores/
│   └── uiStore.ts          # Jotai 아톰 (UI 상태)
├── types/
│   └── index.ts            # TypeScript 타입 정의
├── App.tsx                 # 라우팅 설정
├── main.tsx                # 진입점 (QueryClient, Router 설정)
└── index.css               # PandaCSS 레이어
```

---

## 명령어 목록 (Commands)

### 백엔드 (루트)

| 명령어 | 설명 |
|--------|------|
| `pnpm run dev` | 전체 파이프라인 실행 (데이터 수집 + 임베딩 + 저장) |
| `pnpm run dev --reset` | 벡터 컬렉션 리셋 후 파이프라인 실행 |
| `pnpm run reindex` | 기존 데이터로 재임베딩 (데이터 수집 생략) |
| `pnpm run ask "질문"` | 질의응답 모드 실행 |
| `pnpm run chroma:setup` | ChromaDB 설치 (최초 1회) |
| `pnpm run chroma:start` | ChromaDB 서버 실행 |

### 프론트엔드 (`frontend/`)

| 명령어 | 설명 |
|--------|------|
| `pnpm run dev` | 개발 서버 실행 (http://localhost:5173) |
| `pnpm run build` | 프로덕션 빌드 |
| `pnpm run preview` | 빌드 결과 미리보기 |
| `pnpm run panda` | PandaCSS 코드 생성 |

---

## AI API Fallback 동작

| 기능 | 1순위 | 2순위 (Fallback) |
|------|-------|------------------|
| **임베딩 생성** | OpenAI (`text-embedding-3-small`) | Chroma 기본 임베딩 (로컬, 무료) |
| **답변 생성** | OpenAI (`gpt-4o`) | Claude (`claude-sonnet-4-20250514`) |

- API 키가 없거나 할당량 초과 시 자동으로 fallback으로 전환
- **API 키 없이도 Chroma 기본 임베딩으로 동작 가능**

---

## 질의응답 성공 예시

```bash
$ pnpm ask "기술스택 알려줘"

🔍 Searching in collection: portfolio-commits
❓ Question: 기술스택 알려줘

... 검색 중 (Retrieving contexts) ...
✅ Chroma default embedding successful
   → Found 5 relevant documents.

... 답변 생성 중 (Generating answer) ...
✅ Claude answer generation successful

🤖 Answer:
---------------------------------------------------
**프론트엔드:**
- React (TypeScript)
- Motion/Framer Motion (애니메이션)
- React i18n (다국어 지원)

**백엔드/인프라:**
- Supabase (데이터베이스)
- Vercel (서버리스 배포)
- GitHub Actions (CI/CD)
---------------------------------------------------
```

---

## 진행 현황 (Progress)

- [x] 분석 대상 레포지토리 확정: React + Vite 기반 portfolio
- [x] TypeScript 기반 프로젝트 환경 구성
- [x] GitHub API + 로컬 Git 데이터 수집 파이프라인
- [x] NLP 입력용 데이터 정제
- [x] NLP 기반 질의응답 시스템 (임베딩 + 검색 + LLM) ✅
- [x] 프론트엔드 프로젝트 구조 설계 ✅
- [ ] 프론트엔드 UI 구현 (Q&A 페이지, 대시보드)
- [ ] 백엔드 API 서버 구현
- [ ] 프론트엔드-백엔드 연동

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

---

### 문제: 검색 결과가 0건

```
→ Found 0 relevant documents.
```

**원인**: 임베딩 차원 불일치 (OpenAI ↔ Chroma 전환 시)

**해결**: 재임베딩 실행
```bash
pnpm run reindex
```

---

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

## 라이선스

ISC License
