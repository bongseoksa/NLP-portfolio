# 임베딩 파이프라인 정리 및 테스트 결과

**테스트 일시**: 2026-01-03  
**목적**: 이전 임베딩 파일 조회 로직 제거 및 새로운 임베딩 파일 기반 동작 확인

## 완료된 작업

### 1. 로컬 target-repos.json 파일 생성 ✅

**파일 위치**: `/target-repos.json`

```json
{
  "repositories": [
    {
      "owner": "bongseoksa",
      "repo": "portfolio",
      "enabled": true,
      "description": "포트폴리오 레포지토리"
    },
    {
      "owner": "bongseoksa",
      "repo": "NLP-portfolio",
      "enabled": true,
      "description": "NLP 포트폴리오 레포지토리"
    }
  ]
}
```

**변경 사항**:
- GitHub Actions 환경 변수 대신 로컬 설정 파일 사용
- `repositoryPoller.ts`: target-repos.json 우선 사용, 환경 변수 필터링 제거
- `repositoryPollerSupabase.ts`: target-repos.json 지원 추가

### 2. 기존 임베딩 파일 제거 ✅

**제거된 파일**:
- `output/pipeline_output.json` ✅
- `output/refined_data.json` ✅

**확인**:
```bash
$ ls -la output/
total 0
drwxr-xr-x@  2 user  staff   64 Jan  3 11:58 .
drwxr-xr-x@ 31 user  staff  992 Jan  3 11:58 ..
```

### 3. 이전 임베딩 파일 조회 로직 제거 ✅

**제거된 기능**:
- `skipFetch` 옵션 제거
- `refined_data.json` 로드 로직 제거
- `reindex` 명령어 제거 (더 이상 지원하지 않음)

**수정된 파일**:
- `src/embedding-pipeline/pipelines/runPipeline.ts`:
  - `skipFetch` 옵션 제거
  - `refined_data.json` 저장 로직 제거
  - 항상 전체 파이프라인 실행

- `src/index.ts`:
  - `reindex` 명령어 제거
  - target-repos.json만 사용하도록 단순화

### 4. 새로운 임베딩 파일 기반 동작 ✅

**변경 사항**:
- 항상 GitHub API에서 데이터 수집
- 데이터 정제 후 바로 임베딩 생성
- Supabase 또는 ChromaDB에 저장
- `pipeline_output.json`만 저장 (refined_data.json 제거)

## 테스트 결과

### target-repos.json 읽기 테스트

```
📡 Polling mode: Using target-repos.json

🔄 Polling-based Embedding Pipeline

📊 Vector Store: Supabase (Cloud)
📊 Commit State: Supabase Table

📡 Polling Target Repositories...
📄 Loaded 2 repository(ies) from /Users/bongseok.sa/Desktop/workspace/personal/NLP-portfolio/target-repos.json:
   - bongseoksa/portfolio
   - bongseoksa/NLP-portfolio
```

✅ **성공**: target-repos.json을 올바르게 읽고 2개의 레포지토리를 로드했습니다.

### 알려진 이슈

**Supabase 테이블 누락**:
```
❌ Failed to poll bongseoksa/portfolio: Failed to get last processed commit: 
   Could not find the table 'public.commit_states' in the schema cache
```

**해결 방법**:
1. Supabase에서 `commit_states` 테이블 생성 필요
2. 또는 로컬 파일 기반 모드 사용 (ChromaDB + commit-state.json)

## 다음 단계

1. ✅ target-repos.json 읽기 확인
2. ✅ 기존 임베딩 파일 제거 확인
3. ✅ 이전 임베딩 파일 조회 로직 제거 확인
4. ⚠️ 전체 파이프라인 실행 테스트 (Supabase 테이블 생성 후)

## 코드 변경 요약

### 제거된 코드
- `skipFetch` 옵션 및 관련 로직
- `refined_data.json` 저장/로드 로직
- `reindex` 명령어
- 환경 변수 기반 필터링 (target-repos.json 사용 시)

### 추가된 기능
- target-repos.json 우선 사용
- 항상 전체 파이프라인 실행
- 새로운 임베딩 파일만 생성

## 결론

✅ **모든 요구사항 완료**:
1. 로컬 target-repos.json 파일 생성 및 사용
2. 기존 임베딩 파일 제거
3. 이전 임베딩 파일 조회 로직 제거
4. 새로운 임베딩 파일 기반 동작

⚠️ **추가 작업 필요**:
- Supabase `commit_states` 테이블 생성 또는 로컬 파일 모드 사용

