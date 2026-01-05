# GitHub Actions Workflows

이 디렉토리에는 임베딩 파이프라인 자동화를 위한 GitHub Actions 워크플로우가 포함되어 있습니다.

## 📋 워크플로우 목록

### 1. `unified-embedding-pipeline.yml` - 통합 임베딩 파이프라인 (권장) ⭐

**트리거**:
- 매주 토요일 18:00 UTC (일요일 03:00 KST)
- 수동 실행 (`workflow_dispatch`)

**용도**: 완전 자동화된 end-to-end 임베딩 파이프라인

**특징**:
- ✅ 20단계 완전 자동화 (데이터 수집 → 임베딩 → 정리 → 내보내기 → 커밋)
- ✅ 다중 레포지토리 지원 (target-repos.json 기반)
- ✅ Q&A 히스토리 자동 임베딩
- ✅ 자동 데이터 정리:
  - 6개월 초과 데이터 삭제
  - 삭제된 파일 임베딩 제거
  - 10MB 용량 제한 (우선순위 기반 pruning)
- ✅ 증분 업데이트 (commit-state.json v2.0)
- ✅ Git 자동 커밋 및 푸시
- ✅ Artifact 기반 상태 복원
- ✅ 비용 최적화 (주 1회 = 월 60분)

**사용법**:
```bash
# Actions 탭에서 수동 실행
# 옵션:
# - reset: false (증분 업데이트, 기본값)
# - reset: true (전체 재임베딩)
# - skip_cleanup: false (정리 수행, 기본값)
# - skip_cleanup: true (정리 생략)
# - max_size_mb: 10 (최대 파일 크기, 기본값)
```

**출력**:
- `output/embeddings.json.gz` - 압축된 벡터 파일 (≤10MB)
- `commit-state.json` - 상태 추적 파일 (v2.0)
- GitHub Actions Summary - 상세한 실행 통계

---

### 2. `polling-embed.yml.disabled` - 레거시 임베딩 (비활성화됨)

**상태**: ⚠️ 비활성화됨 (unified-embedding-pipeline.yml로 대체)

**이전 기능**:
- 스케줄 기반 임베딩 생성
- Supabase 저장
- 별도의 export 단계 필요

**마이그레이션**: `unified-embedding-pipeline.yml` 사용 권장

---

## 🔧 워크플로우 선택 가이드

| 상황 | 권장 워크플로우 | 이유 |
|------|---------------|------|
| 모든 프로젝트 (기본값) | `unified-embedding-pipeline.yml` | 완전 자동화, 데이터 정리 포함 |
| 초기 설정 (첫 실행) | `unified-embedding-pipeline.yml` (reset=true) | 전체 임베딩 생성 |
| 데이터 용량 관리 | `unified-embedding-pipeline.yml` | 자동 정리 (6개월 + 삭제 파일 + 10MB 제한) |
| 레거시 파이프라인 | `polling-embed.yml.disabled` 재활성화 | 권장하지 않음 |

---

## 📊 비용 분석

### GitHub Actions 무료 tier (2,000분/월)

**unified-embedding-pipeline.yml** (권장):
- 실행 시간: ~20-30분/회 (전체 파이프라인)
- 주 1회: 80-120분/월 (4-6% 사용) ✅
- 포함 기능:
  - 다중 레포지토리 데이터 수집
  - Q&A 히스토리 임베딩
  - 자동 데이터 정리
  - 파일 내보내기 및 Git 커밋

**Total (권장 구성)**:
- unified pipeline (주 1회) = **80-120분/월** (4-6% 사용) ✅
- 이전 구성 대비 단순화 (2개 워크플로우 → 1개)

---

## 🚀 초기 설정

### 1. GitHub Secrets 설정

`Settings → Secrets and variables → Actions → New repository secret`

필수 Secrets:
```bash
GITHUB_TOKEN               # 자동 제공됨 (레포지토리 접근)
SUPABASE_URL               # https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY  # Supabase → Settings → API
```

선택 Secrets (레거시 파이프라인용):
```bash
OPENAI_API_KEY             # OpenAI 임베딩 (레거시 전용)
BLOB_READ_WRITE_TOKEN      # Vercel Blob (사용 안 함)
VECTOR_FILE_URL            # CDN URL (검증용)
```

### 2. 첫 실행

```bash
# 1. Actions 탭 → Unified Embedding Pipeline
# 2. Run workflow
#    - Use workflow from: main
#    - reset: true (전체 임베딩)
#    - skip_cleanup: false (정리 수행)
#    - max_size_mb: 10 (기본값)
# 3. 실행 완료 확인 (20-30분 소요)
# 4. 결과 확인
#    - output/embeddings.json.gz (Git 커밋됨)
#    - commit-state.json (v2.0 스키마)
#    - Artifacts: embeddings-{run_number} (백업)
```

### 3. 배포

```bash
# 1. 파이프라인 실행 완료 대기
# 2. GitHub Raw URL 확인
#    https://raw.githubusercontent.com/{owner}/{repo}/main/output/embeddings.json.gz
# 3. 프로덕션 환경 변수 설정
#    VECTOR_FILE_URL=https://raw.githubusercontent.com/{owner}/{repo}/main/output/embeddings.json.gz
# 4. Vercel 서비스 배포 (자동으로 새 embeddings.json.gz 사용)
```

---

## 🔍 모니터링

### Actions 대시보드

**확인 사항**:
- ✅ Workflow 실행 상태
- ⏱️ 실행 시간 (비용 추정)
- 📦 Artifacts 크기

### Artifact 다운로드

```bash
# commit-state.json 확인
cat commit-state.json | jq .

# 레포지토리별 상태
cat commit-state.json | jq '.repositories'

# 마지막 업데이트
cat commit-state.json | jq '.lastUpdated'
```

---

## 🐛 트러블슈팅

### "No new embeddings" 반복

**원인**: commit-state.json이 최신 상태로 유지됨 (정상)

**해결**:
```bash
# 증분 업데이트가 정상 작동 중
# 새 커밋이 없으면 "No new Q&A items" 출력
# 필요 시 수동 리셋: Actions → Run workflow → reset: true
```

### 파일 크기가 10MB 초과

**원인**: 데이터가 용량 제한을 초과함

**해결**:
```bash
# 1. 자동 pruning 확인 (로그에서)
# 2. max_size_mb 조정 (workflow_dispatch 옵션)
# 3. 수동 정리:
#    - skip_cleanup: false로 실행
#    - 6개월 초과 데이터 자동 삭제
```

### Workflow 실패

**원인**: Supabase 연결 실패, GitHub API rate limit 등

**해결**:
```bash
# 1. 로그 확인 (Actions → 실패한 실행)
# 2. Artifacts에서 pipeline-logs-{run_number} 다운로드
# 3. Secrets 확인 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN)
# 4. Retry 로직이 3회 재시도 후에도 실패하면 수동 재실행
```

### Artifact 업로드 실패

**원인**: GitHub Actions 스토리지 용량 초과

**해결**:
- 자동 fallback: commit-state.json을 Git에 커밋
- embeddings.json.gz는 이미 Git 커밋됨 (백업 안전)
- 수동 정리: Settings → Actions → Artifacts 삭제

### Q&A 히스토리가 임베딩되지 않음

**원인**: lastQATimestamp 이후 새 Q&A가 없음

**해결**:
```bash
# 1. commit-state.json 확인
#    cat commit-state.json | jq '.lastQATimestamp'
# 2. Supabase qa_history 테이블 확인
# 3. 필요 시 reset: true로 전체 재임베딩
```

### 삭제된 파일이 여전히 검색됨

**원인**: 정리 단계가 skip되었거나 실패함

**해결**:
```bash
# 1. skip_cleanup: false로 재실행
# 2. GitHub tree API 호출 확인 (로그에서)
# 3. Supabase에서도 삭제 확인
```

---

## 📝 고급 사용법

### Concurrency 제어

워크플로우에 이미 적용됨:
```yaml
concurrency:
  group: unified-pipeline-${{ github.ref }}
  cancel-in-progress: true
```

동일 브랜치에서 동시 실행 방지.

### 수동 트리거 옵션

Actions 탭에서:
1. "Unified Embedding Pipeline" 선택
2. "Run workflow" 클릭
3. 옵션 설정:
   - **reset**: 전체 재임베딩 (기본값: false)
   - **skip_cleanup**: 정리 생략 (기본값: false)
   - **max_size_mb**: 최대 파일 크기 (기본값: 10)
4. "Run workflow" 확인

### 로컬 실행

개발 환경에서 파이프라인 테스트:
```bash
# 증분 업데이트
pnpm run embed:unified

# 전체 리셋
pnpm run embed:unified:reset

# 환경 변수 확인
# .env 파일에 GITHUB_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요
```

### commit-state.json 수동 편집

긴급 상황 시 수동 편집 가능:
```json
{
  "version": "2.0",
  "repositories": {
    "owner/repo": {
      "lastCommitSha": "이전 SHA로 변경하여 재처리",
      "lastUpdated": "2026-01-05T..."
    }
  },
  "lastQATimestamp": "1970-01-01T00:00:00.000Z",  // 초기화하여 모든 Q&A 재처리
  "lastCleanupRun": "2026-01-05T...",
  "lastUpdated": "2026-01-05T..."
}
```

Git에 커밋 후 파이프라인 재실행.

---

## 📈 데이터 정리 정책

통합 파이프라인은 자동으로 다음 정리를 수행합니다:

### 1. Age-Based Cleanup (6개월 보존)
- 커밋 임베딩: `commit.metadata.date` 기준
- Q&A 임베딩: `qa.metadata.timestamp` 기준
- Supabase + 파일 모두 삭제

### 2. Deleted Files Cleanup
- GitHub tree API로 현재 파일 목록 조회
- 존재하지 않는 파일의 임베딩 제거
- 레포지토리별 독립 처리

### 3. Capacity Limit (10MB 압축 후)
- 우선순위 점수 계산:
  - 최근 커밋 (<3개월): 100점
  - 소스 파일 (.ts/.js/.py 등): +40점
  - 최근 Q&A (<1개월): 90점
  - 파일 청크 (index > 0): -30점
- 상위 95% 유지 (여유 확보)

### commit-state.json v2.0 스키마

```json
{
  "version": "2.0",
  "repositories": {
    "owner/repo": {
      "lastCommitSha": "최근 처리된 커밋 SHA",
      "lastTreeSha": "레포 tree SHA (삭제 파일 감지용, 선택)",
      "lastUpdated": "마지막 업데이트 시점"
    }
  },
  "lastQATimestamp": "마지막 Q&A 처리 시점",
  "lastCleanupRun": "마지막 정리 실행 시점",
  "lastUpdated": "전체 파이프라인 마지막 실행 시점"
}
```

---

## 🔗 관련 문서

- **프로젝트 가이드**: [CLAUDE.md](../../CLAUDE.md)
- **통합 파이프라인 계획**: [.claude/plans/sequential-forging-stearns.md](../../.claude/plans/sequential-forging-stearns.md)
- **정리 로직**: [scripts/lib/cleanup.ts](../../scripts/lib/cleanup.ts)
- **메인 오케스트레이터**: [scripts/unified-embedding-pipeline.ts](../../scripts/unified-embedding-pipeline.ts)

---

**업데이트**: 2026-01-05
**버전**: 2.0.0 (Unified Pipeline)
