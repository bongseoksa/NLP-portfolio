# NLP-Portfolio 프로젝트 완전 구축 가이드

> **📌 중요**: 이 가이드는 프로젝트를 **처음부터 끝까지 순서대로** 구축하는 실행 가이드입니다.
>
> 각 단계를 **반드시 순서대로** 진행하면 프로젝트 생성부터 E2E 테스트까지 완료됩니다.

---

## 🎯 가이드 목표

이 가이드를 완료하면:
- ✅ GitHub 리포지토리 분석 NLP/RAG 시스템 구축
- ✅ Vercel Serverless Functions 기반 API 서버 배포
- ✅ React 프론트엔드 구축 및 배포
- ✅ 월 $0 운영비로 프로덕션 서비스 가능

---

## 📚 문서 구조

```
docs/final/
├── README.md                      ← 현재 문서 (실행 순서 가이드)
├── 00_프로젝트_개요.md            (프로젝트 이해)
├── 01_기술_스택.md                (기술 스택 상세)
├── 02_시스템_아키텍처.md          (구조 및 설계 원칙)
├── 03_환경_설정.md                (개발 환경 준비)
├── 04_프로젝트_초기화.md          (프로젝트 생성)
├── 05_데이터베이스_설정.md        (Supabase)
├── 06_임베딩_파이프라인_구축.md    (GitHub 데이터 수집)
├── 07_API_서버_구축.md            (Vercel Serverless)
├── 08_프론트엔드_구축.md          (React UI)
├── 09_배포_가이드.md              (Vercel 배포)
└── 10_테스트_가이드.md            (E2E 테스트)
```

---

## 🚀 빠른 시작 (Quick Start)

### 전제 조건

- [x] Node.js 20+ 설치
- [x] pnpm 설치
- [x] Git 설치
- [x] GitHub 계정
- [x] 코드 에디터 (VS Code 권장)

### 5단계 빠른 실행

```bash
# 1단계: 프로젝트 클론 및 의존성 설치
git clone https://github.com/YOUR_USERNAME/NLP-portfolio.git
cd NLP-portfolio
pnpm install

# 2단계: 환경 변수 설정
cp .env.example .env
# .env 파일 편집: SUPABASE_URL, OPENAI_API_KEY, CLAUDE_API_KEY 등 설정

# 3단계: Supabase 데이터베이스 설정
# Supabase 대시보드에서 SQL 편집기로 스키마 실행
# (상세 가이드: 05_데이터베이스_설정.md)

# 4단계: 임베딩 파이프라인 실행 (로컬)
pnpm run embed

# 5단계: 개발 서버 실행
pnpm run server        # API 서버 (포트 3001)
pnpm run dev:frontend  # 프론트엔드 (포트 5173)
```

✅ 브라우저에서 `http://localhost:5173` 접속 → Q&A 페이지 확인!

---

## 📖 완전 구축 가이드 (Step-by-Step)

처음부터 프로젝트를 구축하려면 아래 순서대로 진행하세요.

### Step 0: 사전 이해

**목표**: 프로젝트 개념 및 기술 스택 이해

| 문서 | 예상 시간 | 설명 |
|------|----------|------|
| [00_프로젝트_개요.md](./00_프로젝트_개요.md) | 10분 | 프로젝트 정의, 목표, 핵심 기능 |
| [01_기술_스택.md](./01_기술_스택.md) | 15분 | 사용 기술 및 선택 이유 |
| [02_시스템_아키텍처.md](./02_시스템_아키텍처.md) | 20분 | 전체 구조, 데이터 흐름, 설계 원칙 |

**완료 조건**: 프로젝트가 무엇을 하는지, 어떤 기술을 사용하는지 이해

---

### Step 1: 개발 환경 설정

**목표**: 로컬 개발 환경 준비

👉 **[03_환경_설정.md](./03_환경_설정.md)** 참조

**작업 내용**:
1. Node.js 20+ 설치
2. pnpm 설치
3. Git 설정
4. VS Code 설치 및 확장 프로그램 설치

**완료 조건**:
```bash
node --version  # v20.0.0 이상
pnpm --version  # v10.17.1 이상
git --version   # 정상 출력
```

**예상 시간**: 20분

---

### Step 2: 프로젝트 초기화

**목표**: 새 프로젝트 생성 및 초기 설정

👉 **[04_프로젝트_초기화.md](./04_프로젝트_초기화.md)** 참조

**작업 내용**:
1. GitHub 레포지토리 생성
2. Vite + React + TypeScript 프로젝트 초기화
3. 폴더 구조 생성 (`api/`, `src/`, `scripts/`, `shared/`)
4. `package.json` 의존성 설치
5. `.env.example` 파일 생성
6. `.gitignore` 설정

**완료 조건**:
```bash
pnpm install  # 에러 없이 완료
pnpm run dev:frontend  # 개발 서버 시작 확인 (포트 5173)
```

**예상 시간**: 30분

---

### Step 3: Supabase 데이터베이스 설정

**목표**: PostgreSQL + pgvector 데이터베이스 구축

👉 **[05_데이터베이스_설정.md](./05_데이터베이스_설정.md)** 참조

**작업 내용**:
1. Supabase 계정 생성
2. 새 프로젝트 생성 (Free Tier)
3. SQL 에디터에서 스키마 실행:
   - `00_init.sql` (pgvector extension)
   - `qa_history`, `embeddings`, `ping` 테이블 생성
4. RLS (Row Level Security) 정책 설정
5. API 키 복사:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
6. `.env` 파일에 API 키 저장

**완료 조건**:
- ✅ Supabase 대시보드에서 테이블 확인
- ✅ `.env` 파일에 Supabase 환경 변수 설정 완료

**예상 시간**: 30분

---

### Step 4: 임베딩 파이프라인 구축

**목표**: GitHub 데이터 수집 및 임베딩 생성

👉 **[06_임베딩_파이프라인_구축.md](./06_임베딩_파이프라인_구축.md)** 참조

**작업 내용**:
1. `target-repos.json` 설정 파일 생성
   ```json
   {
     "repositories": [
       {
         "owner": "YOUR_USERNAME",
         "repo": "portfolio",
         "enabled": true
       }
     ]
   }
   ```

2. GitHub Personal Access Token (PAT) 생성
   - GitHub Settings → Developer settings → Personal access tokens
   - 권한: `repo` (Full control of private repositories)
   - `.env`에 `GITHUB_TOKEN` 저장

3. OpenAI API 키 발급 (쿼리 임베딩용)
   - `.env`에 `OPENAI_API_KEY` 저장

4. 통합 임베딩 파이프라인 실행
   ```bash
   pnpm run embed
   ```

**파이프라인 실행 과정** (20단계):
1. target-repos.json 로드
2. GitHub API로 커밋 목록 가져오기
3. 커밋별 diff + 파일 가져오기
4. 레포지토리 전체 소스 파일 가져오기
5. Hugging Face 임베딩 생성 (384차원)
6. Supabase pgvector에 저장
7. Q&A 히스토리 조회 및 임베딩
8. 데이터 정리 (6개월 이상 데이터, 삭제된 파일)
9. `embeddings.json.gz` export
10. `commit-state.json` 업데이트

**완료 조건**:
- ✅ `output/embeddings.json.gz` 파일 생성
- ✅ Supabase `embeddings` 테이블에 데이터 저장
- ✅ 콘솔에 "✅ Unified embedding pipeline completed successfully!" 출력

**예상 시간**: 15-30분 (레포지토리 크기에 따라)

---

### Step 5: API 서버 구축

**목표**: Vercel Serverless Functions 기반 API 서버 구축

👉 **[07_API_서버_구축.md](./07_API_서버_구축.md)** 참조

**작업 내용**:
1. `api/` 디렉토리 구조 생성
2. 핵심 API 엔드포인트 구현:
   - `api/ask.ts` - Q&A 처리
   - `api/health.ts` - Health check
   - `api/history/index.ts` - Q&A 히스토리
   - `api/dashboard/*.ts` - 대시보드 통계
3. File-based 벡터 검색 구현 (`fileVectorStore.ts`)
4. LLM Fallback 체인 구현 (`answer.ts`)
5. CORS 설정 (`api/_lib/cors.ts`)

**로컬 테스트**:
```bash
# API 서버 시작
pnpm run server

# 다른 터미널에서 테스트
curl http://localhost:3001/api/health
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "이 프로젝트의 기술 스택은?"}'
```

**완료 조건**:
- ✅ `http://localhost:3001/api/health` 응답 성공
- ✅ Q&A API 정상 응답

**예상 시간**: 1-2시간

---

### Step 6: 프론트엔드 구축

**목표**: React 기반 UI 구현

👉 **[08_프론트엔드_구축.md](./08_프론트엔드_구축.md)** 참조

**작업 내용**:
1. PandaCSS 설정 (`panda.config.ts`)
2. Jotai + TanStack Query 상태 관리 설정
3. 페이지 구현:
   - `src/pages/QAPage.tsx` - ChatGPT 스타일 Q&A
   - `src/pages/DashboardPage.tsx` - 통계 대시보드
   - `src/pages/SettingsPage.tsx` - 서버 상태
4. React Router 라우팅 설정
5. API 클라이언트 구현 (`src/api/client.ts`)

**로컬 테스트**:
```bash
# 프론트엔드 개발 서버 시작
pnpm run dev:frontend

# 브라우저에서 확인
http://localhost:5173
```

**완료 조건**:
- ✅ 3개 페이지 (/, /dashboard, /settings) 정상 렌더링
- ✅ API 서버 연동 성공
- ✅ 질문 입력 후 답변 표시 확인

**예상 시간**: 2-3시간

---

### Step 7: Vercel 배포

**목표**: 프로덕션 환경 배포

👉 **[09_배포_가이드.md](./09_배포_가이드.md)** 참조

**작업 내용**:
1. Vercel 계정 생성
2. GitHub 레포지토리 연동
3. 환경 변수 설정 (Vercel Dashboard):
   - `VECTOR_FILE_URL` (GitHub Raw URL)
   - `OPENAI_API_KEY`
   - `CLAUDE_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
4. `vercel.json` 설정
5. GitHub `main` 브랜치 푸시 → 자동 배포

**완료 조건**:
- ✅ Vercel 배포 성공
- ✅ 배포 URL 접속 확인
- ✅ API 엔드포인트 정상 동작
- ✅ Q&A 기능 테스트 통과

**예상 시간**: 30분

---

### Step 8: GitHub Actions CI 설정

**목표**: 자동 임베딩 파이프라인 구축

**작업 내용**:
1. `.github/workflows/unified-embedding-pipeline.yml` 생성
2. GitHub Secrets 설정:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `CLAUDE_API_KEY`
3. 스케줄 트리거 설정 (매주 토요일 18:00 UTC)
4. 수동 실행 테스트 (`workflow_dispatch`)

**완료 조건**:
- ✅ GitHub Actions 워크플로우 성공
- ✅ `output/embeddings.json.gz` 자동 커밋
- ✅ Vercel 자동 재배포

**예상 시간**: 30분

---

### Step 9: E2E 테스트

**목표**: 전체 시스템 검증

👉 **[10_테스트_가이드.md](./10_테스트_가이드.md)** 참조

**테스트 체크리스트**:

#### 9.1 벡터 파일 테스트
- [ ] `output/embeddings.json.gz` 파일 존재 확인
- [ ] 파일 압축 해제 및 JSON 구조 검증
- [ ] 통계 정보 확인 (commit, file, qa count)

#### 9.2 API 테스트
- [ ] `GET /api/health` - 200 OK
- [ ] `POST /api/ask` - 정상 응답
- [ ] `GET /api/history` - 히스토리 조회
- [ ] `GET /api/dashboard/summary` - 통계 조회

#### 9.3 프론트엔드 테스트
- [ ] Q&A 페이지 질문 입력 → 답변 표시
- [ ] 소스 인용 클릭 동작
- [ ] 대시보드 차트 렌더링
- [ ] 모바일 반응형 확인

#### 9.4 성능 테스트
- [ ] Cold Start < 500ms
- [ ] API 응답 시간 < 3초
- [ ] 페이지 로드 시간 < 2초

**완료 조건**:
- ✅ 모든 체크리스트 통과
- ✅ 에러 없이 프로덕션 동작

**예상 시간**: 1시간

---

## 🎯 완료 후 확인사항

### ✅ 프로젝트 완성 체크리스트

- [ ] Supabase 데이터베이스 정상 동작
- [ ] 임베딩 파이프라인 로컬 실행 성공
- [ ] `output/embeddings.json.gz` 파일 생성
- [ ] API 서버 로컬 실행 (포트 3001)
- [ ] 프론트엔드 로컬 실행 (포트 5173)
- [ ] Vercel 배포 성공
- [ ] GitHub Actions 워크플로우 정상 실행
- [ ] E2E 테스트 통과

### 📊 시스템 검증

```bash
# 1. 벡터 파일 검증
zcat output/embeddings.json.gz | jq '.statistics'

# 2. API 서버 상태 확인
curl https://your-app.vercel.app/api/health

# 3. Q&A 테스트
curl -X POST https://your-app.vercel.app/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "프로젝트 기술 스택은?"}'
```

---

## 🚨 트러블슈팅

### 문제: "Failed to load vector file"
**원인**: `embeddings.json.gz` 파일 없음
**해결**:
```bash
pnpm run embed  # 로컬에서 임베딩 생성
```

### 문제: "Supabase connection failed"
**원인**: 환경 변수 미설정 또는 잘못된 API 키
**해결**:
1. `.env` 파일 확인
2. Supabase Dashboard에서 API 키 재확인
3. `SUPABASE_SERVICE_ROLE_KEY` 사용 (ANON_KEY 아님)

### 문제: "LLM API 실패"
**원인**: API 키 없음 또는 할당량 초과
**해결**:
1. `.env`에 최소 하나의 LLM API 키 설정 (Claude 또는 OpenAI)
2. API 대시보드에서 할당량 확인
3. Fallback 동작 확인 (Claude → Gemini → Mistral)

### 문제: "GitHub Actions 실패"
**원인**: GitHub Secrets 미설정
**해결**:
1. GitHub 레포지토리 → Settings → Secrets and variables → Actions
2. 필수 Secret 추가:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY` (또는 `CLAUDE_API_KEY`)

---

## 📚 추가 학습 자료

### 공식 문서
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Supabase Documentation](https://supabase.com/docs)
- [React 19 Documentation](https://react.dev)
- [Hugging Face Transformers.js](https://huggingface.co/docs/transformers.js)

### 관련 기술
- [pgvector Extension](https://github.com/pgvector/pgvector)
- [PandaCSS](https://panda-css.com/)
- [TanStack Query](https://tanstack.com/query/latest)

---

## 🤝 기여 및 피드백

이슈 및 개선 제안은 GitHub Issues로 부탁드립니다.

---

## 📄 라이선스

MIT License

---

**문서 작성 완료**: 2026-01-05
**총 예상 시간**: 8-12시간 (개발 경험에 따라)
**난이도**: ⭐⭐⭐☆☆ (중급)
