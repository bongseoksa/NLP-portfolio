# Polling-Based Embedding Architecture

이 문서는 GitHub Actions + GitHub API 기반 폴링 임베딩 시스템의 설계와 구현을 설명합니다.

## 📋 목차

- [아키텍처 개요](#아키텍처-개요)
- [핵심 원칙](#핵심-원칙)
- [시스템 구조](#시스템-구조)
- [데이터 흐름](#데이터-흐름)
- [실행 방법](#실행-방법)
- [GitHub Actions 설정](#github-actions-설정)
- [트러블슈팅](#트러블슈팅)

---

## 아키텍처 개요

### 전제 조건

1. **완전한 레포지토리 분리**
   - 임베딩 프로젝트 레포지토리 (이 레포)
   - 임베딩 대상 프로젝트 레포지토리들
   - 대상 레포지토리는 **전혀 수정하지 않음**

2. **폴링 기반 변경 감지**
   - GitHub Actions schedule로 주기적 실행 (매주 일요일 03:00 KST)
   - GitHub API로 대상 레포의 commit 변경 확인
   - 이미 처리한 commit은 절대 재임베딩하지 않음 (idempotent)

3. **다중 레포지토리 지원**
   - `target-repos.json` 설정 파일로 관리
   - 동일 파이프라인으로 여러 레포 처리

---

## 핵심 원칙

### 1. Idempotency (멱등성)
- **동일 commit 재실행 → 결과 중복 없음**
- `commit-state.json`에 처리 완료 commit SHA 저장
- 최신 commit과 비교하여 변경 여부만 확인

### 2. No Intrusion (무침투)
- 대상 레포에 webhook, workflow, 코드 추가 **절대 금지**
- GitHub API의 public 데이터만 사용

### 3. Single Entry Point (단일 진입점)
- 모든 실행은 `pnpm run dev` 또는 `pnpm run dev --reset`만 사용
- GitHub Actions와 로컬에서 동일 명령어

### 4. Automatic Default Branch Detection
- `main` / `master` 등 branch 이름 하드코딩 금지
- GitHub API로 default branch 자동 조회

---

## 시스템 구조

### 파일 구조

```
NLP-portfolio/
├── target-repos.json              # 대상 레포지토리 목록 (수동 편집)
├── commit-state.json              # 처리 완료 commit 기록 (자동 생성)
├── .github/workflows/
│   └── polling-embed.yml          # GitHub Actions 워크플로우
├── src/
│   ├── models/
│   │   └── TargetRepository.ts    # 타입 정의
│   ├── services/
│   │   ├── commitStateManager.ts  # Commit 상태 관리
│   │   └── repositoryPoller.ts    # 폴링 + 변경 감지
│   └── pipeline/
│       ├── runPipeline.ts         # 단일 레포 임베딩
│       └── runPollingPipeline.ts  # 다중 레포 폴링 파이프라인
```

### 핵심 컴포넌트

#### 1. `target-repos.json` - 대상 레포지토리 설정

```json
{
  "repositories": [
    {
      "owner": "facebook",
      "repo": "react",
      "enabled": true,
      "description": "React library"
    },
    {
      "owner": "vercel",
      "repo": "next.js",
      "enabled": true
    }
  ]
}
```

- `enabled: false`로 특정 레포 비활성화 가능
- 배열 순서대로 처리됨

#### 2. `commit-state.json` - 처리 완료 Commit 기록 (자동 생성)

```json
{
  "repositories": {
    "facebook/react": {
      "id": "facebook/react",
      "owner": "facebook",
      "repo": "react",
      "defaultBranch": "main",
      "lastProcessedCommit": "a1b2c3d4...",
      "lastProcessedAt": "2025-12-30T10:00:00Z",
      "totalCommitsProcessed": 5
    }
  },
  "lastUpdated": "2025-12-30T10:00:00Z"
}
```

- **절대 수동 편집하지 마세요** (자동 관리됨)
- `.gitignore`에 포함되어 로컬에만 저장
- GitHub Actions에서는 artifact로 보관

#### 3. `CommitStateManager` - 상태 관리 서비스

```typescript
class CommitStateManager {
  getLastProcessedCommit(owner, repo): string | null
  updateProcessedCommit(owner, repo, commitSha, defaultBranch): void
  resetRepository(owner, repo): void
  resetAll(): void
}
```

#### 4. `RepositoryPoller` - 폴링 서비스

```typescript
class RepositoryPoller {
  async pollRepository(owner, repo): Promise<PollingResult>
  async pollAll(): Promise<PollingResult[]>
  getRepositoriesToProcess(results): PollingResult[]
  markAsProcessed(result): void
}
```

---

## 데이터 흐름

### 1. 폴링 단계 (변경 감지)

```
target-repos.json 로드
    ↓
각 레포지토리 순회:
    ↓
[GitHub API] GET /repos/{owner}/{repo}
    → default branch 조회
    ↓
[GitHub API] GET /repos/{owner}/{repo}/commits?sha={branch}&per_page=1
    → 최신 commit SHA 조회
    ↓
commit-state.json에서 마지막 처리 commit 조회
    ↓
비교:
  - 새 commit 있음 → needsProcessing: true
  - 동일 commit → needsProcessing: false (skip)
    ↓
처리 필요한 레포 목록 반환
```

### 2. 임베딩 단계

```
처리 필요한 레포만 순회:
    ↓
runPipeline({ targetRepo: { owner, repo } })
    ↓
  1. GitHub API로 commit 목록 수집
  2. 각 commit의 변경 파일 + patch 수집
  3. 레포지토리 소스 파일 수집
  4. 데이터 정제 (NLP 형식 변환)
  5. Embedding 생성
  6. ChromaDB에 저장
    ↓
성공 시:
  commitStateManager.markAsProcessed()
  → commit-state.json 업데이트
```

### 3. ChromaDB 저장 전략

#### Collection 분리

- **Collection 단위**: 레포지토리별
- **Collection 이름**: `{repo}-vectors`
  - 예: `react-vectors`, `next.js-vectors`

#### Document ID 전략

```
{owner}/{repo}:{type}:{sha}:{identifier}
```

예시:
```
facebook/react:commit:a1b2c3d4
facebook/react:diff:a1b2c3d4:src/index.ts
facebook/react:file:src/components/Button.tsx:0
```

#### Metadata 필수 필드

```typescript
{
  type: "commit" | "diff" | "file",
  owner: string,
  repo: string,
  branch: string,
  commit_sha: string,
  embedded_at: string,  // ISO 8601
  // ... 타입별 추가 필드
}
```

---

## 실행 방법

### 로컬 실행

#### 1. 초기 설정

```bash
# 1. 대상 레포지토리 설정
vim target-repos.json

# 2. 환경 변수 설정
cat > .env <<EOF
GITHUB_TOKEN=ghp_xxxxx
OPENAI_API_KEY=sk-proj-xxxxx
EOF

# 3. ChromaDB 시작
pnpm run chroma:start
```

#### 2. 폴링 모드 실행 (기본)

```bash
pnpm run dev
```

**동작**:
- `target-repos.json` 로드
- 각 레포의 최신 commit 조회
- 변경된 레포만 임베딩
- `commit-state.json` 업데이트

#### 3. 리셋 모드 (전체 재임베딩)

```bash
pnpm run dev --reset
```

**동작**:
- `commit-state.json` 전체 삭제
- 모든 레포 강제 재임베딩
- ChromaDB collection 재생성

### GitHub Actions 실행

#### 1. Secrets 설정

GitHub repository → Settings → Secrets and variables → Actions

- `GITHUB_TOKEN`: 자동 제공 (설정 불필요)
- `OPENAI_API_KEY`: OpenAI API 키 (필수)

#### 2. 자동 실행 (Schedule)

- **실행 시각**: 매주 토요일 18:00 UTC (일요일 03:00 KST)
- **트리거**: `.github/workflows/polling-embed.yml`의 `schedule`

#### 3. 수동 실행 (Workflow Dispatch)

Actions → "Polling-based Embedding Pipeline" → "Run workflow"

- **Normal mode**: Reset 체크박스 **OFF**
- **Reset mode**: Reset 체크박스 **ON**

---

## GitHub Actions 설정

### 워크플로우 구조

```yaml
on:
  schedule:
    - cron: "0 18 * * 6"  # 매주 토요일 18:00 UTC
  workflow_dispatch:
    inputs:
      reset:
        type: boolean
        default: false

jobs:
  polling-embed:
    runs-on: ubuntu-latest
    services:
      chromadb:
        image: chromadb/chroma:latest
        ports:
          - 8000:8000
```

### 환경 변수

- `GITHUB_TOKEN`: GitHub Actions 자동 제공
- `OPENAI_API_KEY`: Repository Secrets에서 주입
- `CHROMA_HOST`: `localhost` (service container)
- `CHROMA_PORT`: `8000`

### Artifact 저장

```yaml
- name: Upload commit state artifact
  uses: actions/upload-artifact@v4
  with:
    name: commit-state
    path: commit-state.json
    retention-days: 90
```

- `commit-state.json`: 90일 보관 (다음 실행 시 복원 가능)
- `refined_data.json`: 30일 보관 (디버깅용)

---

## 트러블슈팅

### 1. "모든 레포지토리가 이미 최신입니다"

```
✅ All repositories are up to date. Nothing to process.
```

**원인**: 마지막 실행 이후 새로운 commit이 없음

**해결**:
- 정상 동작입니다 (변경이 있을 때만 실행됨)
- 강제 재임베딩이 필요하면: `pnpm run dev --reset`

### 2. "Failed to poll {owner}/{repo}"

**원인**: GitHub API 접근 실패

**확인사항**:
1. `GITHUB_TOKEN` 설정 확인
2. 레포지토리가 private인 경우 토큰 권한 확인
3. API rate limit 확인 (`curl https://api.github.com/rate_limit`)

### 3. ChromaDB 연결 실패

```
❌ Embedding/Vector Store Failed: connect ECONNREFUSED 127.0.0.1:8000
```

**해결**:
```bash
# ChromaDB 시작 확인
pnpm run chroma:start

# 연결 테스트
curl http://localhost:8000/api/v1/heartbeat
```

### 4. Embedding dimension mismatch

```
Found 0 relevant documents
```

**원인**: OpenAI ↔ Chroma 기본 임베딩 간 차원 불일치

**해결**:
```bash
pnpm run dev --reset  # Collection 재생성
```

### 5. GitHub Actions에서 실행 실패

**체크리스트**:
- [ ] `OPENAI_API_KEY` Secret 설정 확인
- [ ] `target-repos.json` 파일 존재 확인 (커밋되어 있어야 함)
- [ ] ChromaDB service health check 통과 확인
- [ ] Workflow 로그에서 에러 메시지 확인

---

## 확장 가능성

### 1. 다른 임베딩 제공자 추가

`src/nlp/embedding/` 디렉토리에 새 제공자 추가:
- Cohere
- Hugging Face
- Vertex AI

### 2. DB 기반 설정 관리

현재: `target-repos.json` (파일)
→ 향후: Supabase, PostgreSQL 등으로 마이그레이션 가능

### 3. Webhook 기반 실시간 트리거

현재: Schedule 기반 폴링 (주 1회)
→ 향후: GitHub Webhook으로 commit 발생 시 즉시 실행

### 4. Incremental Embedding

현재: 전체 레포 재처리
→ 향후: 변경된 파일만 diff 계산하여 부분 업데이트

---

## 보안 고려사항

### 1. Secrets 관리

- ❌ `.env` 파일 절대 commit 금지
- ✅ GitHub Secrets 사용
- ✅ 로컬: `.env` (gitignore 처리)

### 2. API 토큰 권한

**GITHUB_TOKEN 최소 권한**:
- `contents: read` (레포지토리 내용 읽기)
- `metadata: read` (기본 정보 읽기)

**불필요한 권한**:
- ❌ `contents: write`
- ❌ `actions: write`

### 3. Rate Limiting

- GitHub API: 5000 requests/hour (authenticated)
- OpenAI API: Tier별 RPM 제한 확인
- 대량 레포 처리 시 batch 크기 조정

---

## 참고 자료

- [GitHub REST API - Repositories](https://docs.github.com/en/rest/repos)
- [GitHub Actions - Workflow syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [ChromaDB Documentation](https://docs.trychroma.com/)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
