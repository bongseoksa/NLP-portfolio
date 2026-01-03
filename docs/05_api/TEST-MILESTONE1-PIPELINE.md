# Milestone 1: 로컬 임베딩 파이프라인 테스트 결과

**테스트 일시**: 2026-01-03  
**테스트 범위**: Milestone 1 - 로컬 임베딩 파이프라인

## 구현 상태 확인

### ✅ 완료된 항목

#### 1. GitHub 데이터 수집
- ✅ **Octokit 클라이언트 설정**: `@octokit/rest` 패키지 설치 및 초기화 완료
- ✅ **커밋 목록 가져오기**: `fetchAllCommits()` 함수 구현됨
  - 페이지네이션 지원 (per_page: 100)
  - GitHub API v3 사용
- ✅ **커밋별 변경 파일 가져오기**: `fetchFiles()` 함수 구현됨
  - Patch/diff 정보 포함
  - 파일 상태 (added, modified, removed, renamed) 추적
- ✅ **레포지토리 전체 소스 파일 가져오기**: `fetchRepositoryFiles()` 함수 구현됨
  - 기본 브랜치 자동 감지
  - 재귀적 파일 트리 탐색
- ✅ **파일 필터링**: 구현됨
  - 제외 경로: `node_modules`, `.git`, `dist`, `build`, `.next`, `.venv`, `__pycache__`
  - 제외 확장자: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.eot`, `.pdf`
  - 최대 파일 크기: 500KB

#### 2. 데이터 정제
- ✅ **커밋 메시지 + diff 결합**: `preprocessText()` 함수 구현됨
  - Commit, Diff, File 타입별 정제
  - Embedding text 생성기 사용
- ✅ **파일별 청크 분할**: `splitFileIntoChunks()` 함수 구현됨
  - 최대 청크 크기: 5KB (5000 bytes)
  - 의미 기반 오버랩 (15%)
  - 함수/클래스 경계 인식
- ✅ **NLP 친화적 포맷 변환**: `embeddingTextGenerator.ts` 구현됨
  - Commit, Diff, File 타입별 텍스트 생성
- ✅ **메타데이터 구조화**: 완료
  - 타입별 메타데이터 포함 (sha, path, fileType, size 등)

#### 3. 임베딩 생성
- ✅ **OpenAI text-embedding-3-small 모델 사용**: 구현됨
  - 차원: 1536 (마일스톤 문서의 384는 Chroma 기본 임베딩 기준)
  - 배치 처리: batchSize 10
  - 8K 토큰 초과 시 자동 청킹 및 평균화
- ✅ **커밋 임베딩 생성**: 구현됨
- ✅ **파일 임베딩 생성**: 구현됨
- ✅ **배치 처리 구현**: 구현됨
  - 메모리 최적화: 배치 단위 처리
  - 진행률 로깅

#### 4. Supabase 저장
- ✅ **embeddings 테이블에 벡터 저장**: `saveVectorsSupabase()` 구현됨
- ✅ **중복 처리 (UPSERT)**: 구현됨
- ✅ **에러 핸들링 및 재시도**: 구현됨
- ✅ **저장 진행률 로깅**: 구현됨

### ⚠️ 테스트 필요 항목

#### 5. 로컬 테스트
- ⚠️ **`pnpm run dev` 실행**: 환경 변수 설정 필요
- ⚠️ **2개 레포지토리 임베딩 확인**: 실제 실행 필요
- ⚠️ **벡터 검색 정확도 검증**: 실제 실행 필요
- ⚠️ **성능 측정**: 실제 실행 필요

## 구현 상세

### 파이프라인 흐름

```
1. GitHub API 커밋 수집
   ↓
2. 각 커밋의 변경 파일 수집 (patch 포함)
   ↓
3. 레포지토리 전체 소스 파일 수집
   ↓
4. 데이터 정제 (NLP 포맷 변환)
   ↓
5. 임베딩 생성 (OpenAI text-embedding-3-small)
   ↓
6. Supabase에 벡터 저장
```

### 주요 함수

**GitHub 데이터 수집:**
- `fetchAllCommits()`: 커밋 목록 페이지네이션
- `fetchFiles()`: 커밋별 변경 파일 (patch 포함)
- `fetchRepositoryFiles()`: 레포지토리 전체 파일

**데이터 정제:**
- `refineData()`: Raw 데이터를 NLP 포맷으로 변환
- `splitFileIntoChunks()`: 대용량 파일 청크 분할
- `generateCommitEmbeddingText()`, `generateDiffEmbeddingText()`, `generateFileEmbeddingText()`: 타입별 임베딩 텍스트 생성

**임베딩 생성:**
- `generateEmbeddings()`: OpenAI API 호출 (배치 처리)
- `processTextWithChunking()`: 8K 토큰 초과 시 자동 청킹

**저장:**
- `saveVectorsSupabase()`: Supabase pgvector에 저장
- `deleteByRepository()`: Reset 모드 지원

## 환경 변수 요구사항

```bash
# 필수
GITHUB_TOKEN=ghp_xxx
TARGET_REPO_OWNER=username
TARGET_REPO_NAME=repo-name

# 임베딩 생성
OPENAI_API_KEY=sk-proj-xxx

# Supabase 저장
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
```

## 테스트 시나리오

### 시나리오 1: 전체 파이프라인 실행

```bash
pnpm run dev
```

**예상 결과:**
- 커밋 목록 수집
- 변경 파일 수집
- 레포지토리 파일 수집
- 데이터 정제
- 임베딩 생성
- Supabase 저장

### 시나리오 2: 재임베딩 (데이터 수집 건너뛰기)

```bash
pnpm run dev reindex
```

**예상 결과:**
- 기존 `refined_data.json` 사용
- 새 임베딩 생성
- Supabase 업데이트

### 시나리오 3: Reset 모드 (전체 재처리)

```bash
pnpm run dev --reset
```

**예상 결과:**
- 모든 커밋 재처리
- Supabase 컬렉션 리셋
- 새로 임베딩 생성

## 결론

### 완료된 기능

- ✅ GitHub 데이터 수집 (커밋, 파일, 소스 코드)
- ✅ 데이터 정제 및 청크 분할
- ✅ OpenAI 임베딩 생성 (배치 처리)
- ✅ Supabase 벡터 저장

### 테스트 필요

- ⚠️ 실제 파이프라인 실행 (환경 변수 설정 후)
- ⚠️ 2개 레포지토리 임베딩 확인
- ⚠️ 벡터 검색 정확도 검증
- ⚠️ 성능 측정

### 다음 단계

1. 환경 변수 확인 및 설정
2. 실제 파이프라인 실행
3. 결과 검증 및 성능 측정

