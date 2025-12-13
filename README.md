# GitHub Analyzer

GitHub repositories를 분석하여 코드와 커밋 히스토리 정보를 추출하고, NLP 기반 질의응답 시스템을 제공하는 도구입니다.

## 프로젝트 구조 (Project Structure)

```bash
NLP-portfolio/
├── src/                          # 소스 코드 디렉토리
│   ├── index.ts                  # 어플리케이션 진입점 (CLI 명령어 처리)
│   ├── data_sources/             # 데이터 수집 계층
│   │   ├── github/               # GitHub API 연동
│   │   │   ├── fetchCommit.ts    # 커밋 목록 수집
│   │   │   └── fetchFiles.ts     # 커밋별 변경 파일 조회
│   │   └── git/                  # 로컬 Git 분석
│   │       ├── parseLog.ts       # git log 파싱
│   │       └── extractDiff.ts    # 커밋별 diff 추출
│   ├── models/                   # TypeScript 타입 정의
│   │   ├── Commit.ts             # 커밋 데이터 모델
│   │   ├── Diff.ts               # Diff 데이터 모델
│   │   ├── File.ts               # 파일 데이터 모델
│   │   ├── PipelineOutput.ts     # 파이프라인 출력 모델
│   │   └── refinedData.ts        # 정제된 데이터 모델
│   ├── nlp/                      # NLP 관련 모듈
│   │   └── embedding/
│   │       └── openaiEmbedding.ts # 임베딩 생성 (OpenAI/Chroma fallback)
│   ├── pipeline/                 # 데이터 처리 파이프라인
│   │   ├── runPipeline.ts        # 파이프라인 실행 로직
│   │   └── steps/
│   │       └── preprocessText.ts # 텍스트 전처리 및 정제
│   ├── qa/                       # 질의응답 모듈
│   │   └── answer.ts             # LLM 답변 생성 (OpenAI/Claude fallback)
│   └── vector_store/             # 벡터 저장소 연동
│       ├── saveVectors.ts        # ChromaDB에 벡터 저장
│       └── searchVectors.ts      # ChromaDB에서 유사 벡터 검색
├── scripts/                      # 실행 스크립트
│   ├── setup_chroma.sh           # ChromaDB 설치 스크립트
│   └── run_chroma.sh             # ChromaDB 서버 실행 스크립트
├── output/                       # 파이프라인 출력 결과
│   ├── pipeline_output.json      # 수집된 원본 데이터
│   └── refined_data.json         # NLP용 정제 데이터
├── chroma_data/                  # ChromaDB 데이터 저장소
├── .chroma_venv/                 # ChromaDB Python 가상환경
├── .env                          # 환경 변수 설정 (API 키 등)
├── package.json                  # Node.js 의존성 관리
├── tsconfig.json                 # TypeScript 설정
└── README.md                     # 프로젝트 문서
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

# 2. Node.js 의존성 설치
pnpm install
```

### Step 2: 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 추가합니다:

```bash
# .env 파일 생성
touch .env
```

`.env` 파일 내용:

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
# OpenAI API (없으면 Chroma 기본 임베딩 사용)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxx

# Claude API (OpenAI 실패 시 fallback으로 사용)
CLAUDE_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
```

#### GitHub Token 발급 방법

1. [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens) 접속
2. **"Generate new token (classic)"** 클릭
3. 권한 선택: `repo` (Full control of private repositories)
4. 생성된 토큰을 `.env` 파일에 저장

### Step 3: 분석 대상 레포지토리 준비

분석할 레포지토리를 로컬에 클론합니다:

```bash
# 예: portfolio 레포지토리 클론
git clone https://github.com/your-username/portfolio.git ~/projects/portfolio

# .env의 LOCAL_REPO_PATH를 클론된 경로로 설정
# LOCAL_REPO_PATH=/Users/your-name/projects/portfolio
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

실행 결과:
```
🚀 Pipeline started

📌 Fetching commit list from GitHub...
   → 67 commits fetched.
📌 Fetching changed files for each commit...
   → commitFiles completed.
📌 Extracting local diffs...
   → commitDiffs completed.
📌 Data Refinement (NLP Preparation)...
   → 67 items refined.
📌 Generating Embeddings...
   → Generated 67 vectors.
📌 Saving to ChromaDB...
✔ Vector storage save completed.

🎉 Pipeline finished!
```

### Step 6: 질의응답 실행

```bash
# 질문하기
pnpm run ask "이 프로젝트에서 사용하는 기술스택은?"
```

---

## 명령어 목록 (Commands)

| 명령어 | 설명 |
|--------|------|
| `pnpm run dev` | 전체 파이프라인 실행 (데이터 수집 + 임베딩 + 저장) |
| `pnpm run dev --reset` | 벡터 컬렉션 리셋 후 파이프라인 실행 |
| `pnpm run reindex` | 기존 데이터로 재임베딩 (데이터 수집 생략) |
| `pnpm run ask "질문"` | 질의응답 모드 실행 |
| `pnpm run chroma:setup` | ChromaDB 설치 (최초 1회) |
| `pnpm run chroma:start` | ChromaDB 서버 실행 |
| `pnpm run dev help` | 도움말 출력 |

---

## AI API Fallback 동작

이 프로젝트는 **OpenAI**와 **Claude** API를 지원하며, 자동 fallback 기능이 있습니다.

| 기능 | 1순위 | 2순위 (Fallback) |
|------|-------|------------------|
| **임베딩 생성** | OpenAI (`text-embedding-3-small`) | Chroma 기본 임베딩 (로컬, 무료) |
| **답변 생성** | OpenAI (`gpt-4o`) | Claude (`claude-sonnet-4-20250514`) |

- API 키가 없거나 할당량 초과 시 자동으로 fallback으로 전환
- **API 키 없이도 Chroma 기본 임베딩으로 임베딩 생성 가능**

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

## 전처리 파이프라인 (Pipeline Process)

본 프로젝트는 다음 6단계의 데이터 전처리 파이프라인을 거칩니다:

1. **초기화**: `.env` 환경 변수 로드 및 검증
2. **커밋 수집**: GitHub API로 모든 커밋 정보 수집
3. **파일 조회**: 각 커밋의 변경 파일 목록 조회
4. **Diff 추출**: 로컬 Git에서 상세 변경 내역 추출
5. **데이터 정제**: NLP 입력용 텍스트 청크 생성
6. **임베딩 저장**: 벡터 생성 후 ChromaDB에 저장

---

## 진행 현황 (Progress)

- [x] 분석 대상 레포지토리 확정: React + Vite 기반 portfolio
- [x] TypeScript 기반 프로젝트 환경 구성
- [x] GitHub API + 로컬 Git 데이터 수집 파이프라인
- [x] NLP 입력용 데이터 정제
- [x] NLP 기반 질의응답 시스템 (임베딩 + 검색 + LLM) ✅
- [ ] 시각화 및 모니터링 대시보드

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

## 향후 확장 가능성

현재는 프론트엔드 레포지토리에 한정하지만, 추후 다음 데이터까지 추가 가능:

- 백엔드 소스 코드
- DB 스키마
- REST API/GraphQL 명세
- 디자인/기획 문서
- Jira/Notion 이슈 기록

---

## 라이선스

ISC License
