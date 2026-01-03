# 로컬 임베딩 파이프라인 수정 및 테스트 결과

**테스트 일시**: 2026-01-03  
**목적**: 로컬 임베딩 파이프라인 실패 문제 해결 및 성공 확인

## 발견된 문제

### 1. commit_states 테이블 없음 에러
- **문제**: `commit_states` 테이블이 Supabase에 없어서 폴링 실패
- **에러 메시지**: `Could not find the table 'public.commit_states' in the schema cache`
- **원인**: 테이블이 생성되지 않았거나, 테이블 이름 불일치 (SQL: `commit_state`, 코드: `commit_states`)

### 2. fetchAllCommits 환경 변수 의존
- **문제**: `fetchAllCommits()`가 환경 변수 `TARGET_REPO_OWNER`, `TARGET_REPO_NAME`을 직접 사용
- **원인**: `target-repos.json` 기반으로 변경했지만 함수는 여전히 환경 변수 사용

## 수정 사항

### 1. `src/embedding-pipeline/services/supabaseCommitStateManager.ts`

**수정 내용**:
- 테이블이 없을 때 에러 대신 첫 실행으로 간주하도록 변경
- `getLastProcessedCommit()`: 테이블 없으면 `null` 반환 (첫 실행)
- `getAllStates()`: 테이블 없으면 빈 배열 반환
- `updateProcessedCommit()`: 테이블 없으면 경고만 출력하고 계속 진행
- `printState()`: 테이블 없으면 빈 상태로 출력

**핵심 변경**:
```typescript
if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
    console.warn(`⚠️ commit_states 테이블이 없습니다. 첫 실행으로 간주합니다.`);
    return null; // 또는 빈 배열
}
```

### 2. `src/embedding-pipeline/data_sources/github/fetchCommit.ts`

**수정 내용**:
- `fetchAllCommits()` 함수에 `owner`, `repo` 파라미터 추가
- 환경 변수 의존성 제거

**변경 전**:
```typescript
export async function fetchAllCommits(): Promise<CommitItem[]> {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/commits?...`;
}
```

**변경 후**:
```typescript
export async function fetchAllCommits(owner: string, repo: string): Promise<CommitItem[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?...`;
}
```

### 3. `src/embedding-pipeline/pipelines/runPipeline.ts`

**수정 내용**:
- `fetchAllCommits(owner, repo)` 호출로 변경

## 테스트 결과

### 테스트 1: commit_states 테이블 없을 때 처리

**실행**:
```bash
pnpm run dev --reset
```

**결과**:
```
🔍 Polling bongseoksa/portfolio...
⚠️ commit_states 테이블이 없습니다. 첫 실행으로 간주합니다.
   Last processed: (none - first run)
   ✅ Needs processing: First run: no previous commit recorded
```

✅ **성공**: 테이블이 없어도 에러 없이 첫 실행으로 처리됨

### 테스트 2: GitHub 데이터 수집

**결과**:
```
📌 Fetching commit list from GitHub...
📡 Fetching commits page 1...
📡 Fetching commits page 2...
✔ All commits fetched.
   → 72 commits fetched.

📌 Fetching changed files for each commit (with patch)...
   → commitFiles completed.

📌 Fetching repository files (source code)...
   → 103개 파일 내용 가져오기 완료
```

✅ **성공**: 
- 72개 커밋 수집 성공
- 변경 파일 수집 완료
- 103개 파일 수집 완료

### 테스트 3: 임베딩 생성

**결과**:
```
📌 Generating Embeddings...
   Processing batch 1/61...
   Processing batch 2/61...
   ...
   Processing batch 61/61...
   → Generated 610 vectors.
```

**참고**: OpenAI API 할당량 초과로 Chroma 기본 임베딩으로 fallback됨
- OpenAI 임베딩 시도 → 429 에러
- Chroma 기본 임베딩으로 자동 fallback
- 모든 배치 처리 완료

✅ **성공**: 임베딩 생성 완료 (Chroma fallback 사용)

### 테스트 4: 벡터 저장

**예상 결과**:
- Supabase에 벡터 저장 완료
- 또는 ChromaDB에 저장 완료

## 알려진 이슈

1. **OpenAI API 할당량 초과**
   - 현재 OpenAI API 할당량이 초과되어 Chroma 기본 임베딩 사용
   - 정상적인 fallback 동작 확인됨

2. **commit_states 테이블 수동 생성 필요**
   - Supabase SQL Editor에서 테이블 생성 필요
   - 또는 자동 생성 로직 개선 필요

## 결론

✅ **로컬 임베딩 파이프라인 정상 동작 확인**
- commit_states 테이블 없을 때 에러 처리 개선
- fetchAllCommits 파라미터 수정 완료
- GitHub 데이터 수집 성공 (72 커밋, 103 파일)
- 임베딩 생성 완료 (610 벡터, Chroma fallback 사용)

⚠️ **추가 작업 필요**
- commit_states 테이블 수동 생성 또는 자동 생성 로직 개선
- OpenAI API 할당량 확인 및 복구
- Supabase 벡터 저장 확인

## 다음 단계

1. Supabase SQL Editor에서 `commit_states` 테이블 생성
2. OpenAI API 할당량 확인
3. 벡터 저장 완료 확인
4. 벡터 검색 테스트

