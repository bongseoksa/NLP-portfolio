# GitHub Actions Workflows

이 디렉토리에는 임베딩 파이프라인 자동화를 위한 GitHub Actions 워크플로우가 포함되어 있습니다.

## 📋 워크플로우 목록

### 1. `polling-embed.yml` - 스케줄 기반 임베딩 (권장)

**트리거**:
- 매주 토요일 18:00 UTC (일요일 03:00 KST)
- 수동 실행 (`workflow_dispatch`)

**용도**: 정기적으로 모든 레포지토리의 새 커밋을 감지하고 임베딩 수행

**특징**:
- ✅ 증분 업데이트 (commit-state.json 기반)
- ✅ ChromaDB + Supabase 동시 지원
- ✅ Artifact 기반 상태 복원
- ✅ 실패 시 Git fallback
- ✅ 비용 최적화 (주 1회 = 월 60분)

**사용법**:
```bash
# Actions 탭에서 수동 실행
# - reset: false (증분 업데이트)
# - reset: true (전체 재임베딩)
```

---

### 2. `push-embed.yml` - Push 기반 임베딩 (빠른 피드백)

**트리거**:
- `main`, `develop` 브랜치에 push
- `src/**` 경로 변경 시만 (테스트/문서 제외)
- 수동 실행

**용도**: 코드 변경 즉시 임베딩 업데이트

**특징**:
- ✅ Supabase 전용 (ChromaDB 불필요)
- ✅ 커밋 메시지 `[skip-embed]` 태그로 skip 가능
- ✅ 성공 시 자동으로 export workflow 트리거
- ✅ 빠른 실행 (타임아웃 1시간)

**사용법**:
```bash
# 커밋 시 자동 실행
git commit -m "feat: Add new feature"
git push

# Skip 하려면
git commit -m "docs: Update README [skip-embed]"
git push
```

**주의**: 잦은 push 시 GitHub Actions 분 소진 주의

---

### 3. `export-embeddings.yml` - 파일 내보내기 (Serverless 배포)

**트리거**:
- `polling-embed.yml` 완료 후 자동 실행
- 매일 00:30 UTC (백업)
- 수동 실행

**용도**: Supabase에서 임베딩을 JSON 파일로 내보내고 Vercel Blob에 업로드

**특징**:
- ✅ Retry 로직 (Supabase 연결 3회 재시도)
- ✅ 파일 검증 (크기, JSON 구조)
- ✅ CDN 배포 검증 (Vercel Blob)
- ✅ Artifact 백업

**사용법**:
```bash
# 자동 실행 (polling-embed 성공 후)

# 수동 실행 (Actions 탭)
# - Supabase 데이터 → embeddings.json.gz
# - Vercel Blob 업로드
# - Artifact 백업
```

---

## 🔧 워크플로우 선택 가이드

| 상황 | 권장 워크플로우 | 이유 |
|------|---------------|------|
| 안정화된 프로젝트 (주 1-5 push) | `polling-embed.yml` | 비용 최소화, 예측 가능 |
| 활발한 개발 중 (일 10+ push) | `push-embed.yml` | 실시간 반영, 빠른 피드백 |
| Serverless 배포 필요 | `export-embeddings.yml` | CDN 기반, 서버 비용 0원 |
| 초기 설정 (첫 실행) | `polling-embed.yml` (reset=true) | 전체 임베딩 생성 |

---

## 📊 비용 분석

### GitHub Actions 무료 tier (2,000분/월)

**polling-embed.yml**:
- 실행 시간: ~15분/회
- 주 1회: 60분/월 (3% 사용) ✅
- 일 1회: 450분/월 (22.5% 사용) ✅

**push-embed.yml**:
- 실행 시간: ~5분/회 (증분)
- 일 5회: 750분/월 (37.5% 사용) ✅
- 일 10회: 1,500분/월 (75% 사용) ⚠️

**export-embeddings.yml**:
- 실행 시간: ~3분/회
- 주 1회: 12분/월 (0.6% 사용) ✅

**Total (권장 구성)**:
- polling (주 1회) + export (주 1회) = **72분/월** (3.6% 사용) ✅

---

## 🚀 초기 설정

### 1. GitHub Secrets 설정

`Settings → Secrets and variables → Actions → New repository secret`

필수 Secrets:
```bash
GITHUB_TOKEN               # 자동 제공됨
OPENAI_API_KEY             # OpenAI 대시보드
SUPABASE_URL               # https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY  # Supabase → Settings → API
BLOB_READ_WRITE_TOKEN      # Vercel Blob (선택)
```

선택 Secrets:
```bash
VECTOR_FILE_URL            # CDN URL (검증용)
SLACK_WEBHOOK_URL          # 알림 (선택)
```

### 2. 첫 실행

```bash
# 1. Actions 탭 → Polling-based Embedding Pipeline
# 2. Run workflow
#    - Use workflow from: main
#    - reset: true (전체 임베딩)
# 3. 실행 완료 확인 (15-30분 소요)
# 4. Artifacts 확인
#    - commit-state.json (다운로드하여 검증)
#    - refined-data.json
```

### 3. 배포

```bash
# 1. export-embeddings.yml 수동 실행
# 2. Vercel Blob URL 확인 (로그에서)
# 3. 프로덕션 환경 변수 설정
#    VECTOR_FILE_URL=https://xxx.vercel-storage.com/embeddings.json.gz
# 4. 서비스 배포
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

### "All repositories are up to date" 반복

**원인**: commit-state.json이 업데이트되지 않음

**해결**:
```bash
# 1. Artifacts에서 commit-state.json 다운로드
# 2. 내용 확인 (jq로 검증)
# 3. 문제 시 수동 리셋
#    Actions → Run workflow → reset: true
```

### Workflow 실패

**원인**: Supabase 연결 실패, OpenAI 할당량 초과 등

**해결**:
```bash
# 1. 로그 확인 (Actions → 실패한 실행)
# 2. Artifacts에서 pipeline-logs-xxx 다운로드
# 3. Secrets 확인
# 4. 재실행
```

### Artifact 업로드 실패

**원인**: GitHub Actions 스토리지 용량 초과

**해결**:
- 자동 fallback: commit-state.json을 Git에 커밋
- 수동 정리: Settings → Actions → Artifacts 삭제

---

## 📝 고급 사용법

### Concurrency 제어

워크플로우에 이미 적용됨:
```yaml
concurrency:
  group: embedding-pipeline-${{ github.ref }}
  cancel-in-progress: true
```

동일 브랜치에서 동시 실행 방지.

### 조건부 실행

Push workflow에서 커밋 메시지로 제어:
```bash
# Skip 예시
git commit -m "docs: Update README [skip-embed]"

# 실행 예시
git commit -m "feat: Add feature"
```

### 수동 트리거

Actions 탭에서:
1. 원하는 workflow 선택
2. "Run workflow" 클릭
3. 옵션 설정 (reset 등)
4. "Run workflow" 확인

---

## 🔗 관련 문서

- **CI 자동화 가이드**: [docs/architecture/CI-AUTOMATION.md](../../docs/architecture/CI-AUTOMATION.md)
- **임베딩 스키마**: [docs/architecture/EMBEDDING-SCHEMA.md](../../docs/architecture/EMBEDDING-SCHEMA.md)
- **파일 기반 벡터 스토어**: [docs/architecture/FILE-BASED-VECTOR-STORE.md](../../docs/architecture/FILE-BASED-VECTOR-STORE.md)
- **프로젝트 가이드**: [CLAUDE.md](../../CLAUDE.md)

---

**업데이트**: 2025-12-31
**버전**: 1.0.0
