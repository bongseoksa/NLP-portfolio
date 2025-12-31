# CI Automation: Serverless Embedding Pipeline

> GitHub Actions 기반 임베딩 파이프라인 자동화 가이드
>
> **목표**: 브랜치 업데이트 시 서버 비용 0원으로 임베딩 자동 실행 및 결과 저장

---

## 📋 목차

1. [아키텍처 개요](#아키텍처-개요)
2. [Workflow 트리거 전략](#workflow-트리거-전략)
3. [실행 단계 순서](#실행-단계-순서)
4. [실패 가능 지점과 방어 전략](#실패-가능-지점과-방어-전략)
5. [비용 최적화](#비용-최적화)
6. [운영 가이드](#운영-가이드)

---

## 아키텍처 개요

### 전체 파이프라인 흐름

```
GitHub Push/Schedule → Workflow Trigger
                            ↓
                    ┌───────────────────┐
                    │ 1. Polling Check  │ (증분 업데이트)
                    │ - GitHub API      │
                    │ - commit-state    │
                    └─────────┬─────────┘
                              ↓
                    ┌───────────────────┐
                    │ 2. Embedding Gen  │ (새 commit만)
                    │ - OpenAI API      │
                    │ - Supabase Store  │
                    └─────────┬─────────┘
                              ↓
                    ┌───────────────────┐
                    │ 3. File Export    │ (Serverless)
                    │ - Supabase → JSON │
                    │ - Gzip 압축       │
                    └─────────┬─────────┘
                              ↓
                    ┌───────────────────┐
                    │ 4. CDN Upload     │ (배포)
                    │ - Vercel Blob     │
                    │ - Cache Update    │
                    └───────────────────┘
```

### 핵심 설계 원칙

1. **서버 비용 0원**: GitHub Actions의 무료 tier 활용 (월 2,000분)
2. **전체 재임베딩 방지**: Commit state 기반 증분 업데이트
3. **Idempotent 실행**: 동일 commit 재실행 시 자동 skip
4. **실패 복구**: Artifact 기반 상태 복원 메커니즘

---

## Workflow 트리거 전략

### 1. Push-based Trigger (권장)

**트리거 조건**: 특정 브랜치에 push 발생 시 자동 실행

```yaml
name: Incremental Embedding Pipeline

on:
  push:
    branches:
      - main              # 프로덕션 브랜치
      - develop           # 개발 브랜치
    paths:
      - 'src/**'          # 소스 코드 변경 시만
      - '!src/**/*.test.ts'  # 테스트 파일 제외
      - '!docs/**'        # 문서 변경 제외

  # 수동 실행 허용
  workflow_dispatch:
    inputs:
      reset:
        description: 'Force re-embed all commits'
        type: boolean
        default: false
```

**장점**:
- ✅ 코드 변경 즉시 임베딩 업데이트
- ✅ 개발 워크플로우와 자연스럽게 통합
- ✅ 빠른 피드백 사이클

**단점**:
- ⚠️ 잦은 push 시 Actions 분 소진 빠름
- ⚠️ 동시 실행 가능성 (concurrency 제어 필요)

**적합한 경우**:
- 활발한 개발 중인 프로젝트
- 실시간 임베딩 업데이트가 필요한 경우
- 팀 규모 작고 push 빈도 낮음 (하루 5회 이하)

---

### 2. Schedule-based Trigger (안정적)

**트리거 조건**: 정기적으로 실행 (cron)

```yaml
name: Scheduled Embedding Pipeline

on:
  schedule:
    # 매주 토요일 18:00 UTC (일요일 03:00 KST)
    - cron: '0 18 * * 6'
    # 또는 매일 자정 실행
    # - cron: '0 0 * * *'

  workflow_dispatch:
    inputs:
      reset:
        type: boolean
        default: false
```

**장점**:
- ✅ 예측 가능한 리소스 사용
- ✅ 동시 실행 없음
- ✅ 안정적인 운영

**단점**:
- ⚠️ 실시간성 낮음
- ⚠️ 긴급 업데이트 불가능 (수동 실행 필요)

**적합한 경우**:
- 안정화된 프로젝트 (push 빈도 낮음)
- 비용 최적화가 중요한 경우
- 배치 처리가 적합한 경우

---

### 3. Hybrid Trigger (최적화)

**트리거 조건**: 조건부 실행 + 스케줄 조합

```yaml
name: Smart Embedding Pipeline

on:
  push:
    branches:
      - main
    paths:
      - 'src/**'
      - '!**/*.test.ts'
      - '!**/*.md'

  schedule:
    # 백업 실행: 매주 일요일 새벽 (누락 방지)
    - cron: '0 2 * * 0'

  workflow_dispatch:
    inputs:
      reset:
        type: boolean
        default: false
      branch:
        description: 'Target branch'
        type: string
        default: 'main'

jobs:
  check-changes:
    runs-on: ubuntu-latest
    outputs:
      should_run: ${{ steps.check.outputs.should_run }}
    steps:
      - name: Check if should run
        id: check
        run: |
          # 스케줄 실행이면 무조건 실행
          if [ "${{ github.event_name }}" = "schedule" ]; then
            echo "should_run=true" >> $GITHUB_OUTPUT
            exit 0
          fi

          # Push 실행이면 commit 메시지 확인
          if [[ "${{ github.event.head_commit.message }}" =~ \[skip-embed\] ]]; then
            echo "should_run=false" >> $GITHUB_OUTPUT
          else
            echo "should_run=true" >> $GITHUB_OUTPUT
          fi

  embed:
    needs: check-changes
    if: needs.check-changes.outputs.should_run == 'true'
    runs-on: ubuntu-latest
    # ... 실제 임베딩 작업
```

**장점**:
- ✅ 불필요한 실행 방지 (커밋 메시지로 제어 가능)
- ✅ 백업 스케줄로 누락 방지
- ✅ 유연한 제어

**적합한 경우**:
- 중간 규모 팀 (일 10-30 push)
- 비용과 실시간성 모두 중요
- 세밀한 제어가 필요한 경우

---

### 4. Workflow Chaining (현재 구현)

**트리거 조건**: 임베딩 완료 후 내보내기 자동 실행

```yaml
# .github/workflows/polling-embed.yml
name: Polling-based Embedding Pipeline
on:
  schedule:
    - cron: "0 18 * * 6"
  workflow_dispatch:

jobs:
  polling-embed:
    # ... 임베딩 실행
    steps:
      - name: Upload commit state artifact
        uses: actions/upload-artifact@v4
        with:
          name: commit-state
          path: commit-state.json
```

```yaml
# .github/workflows/export-embeddings.yml
name: Export Embeddings to File
on:
  workflow_run:
    workflows: ["Polling-based Embedding Pipeline"]
    types:
      - completed

jobs:
  export-to-file:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    # ... 파일 내보내기 및 업로드
```

**장점**:
- ✅ 파이프라인 분리 (단일 책임 원칙)
- ✅ 임베딩 실패 시 내보내기 skip
- ✅ 각 단계별 재실행 가능

---

### 트리거 전략 선택 가이드

| 프로젝트 특성 | 권장 전략 | 이유 |
|-------------|---------|------|
| 활발한 개발 중 (일 10+ push) | Hybrid | 비용 최적화 + 실시간성 |
| 안정화 단계 (주 1-5 push) | Schedule | 예측 가능, 저비용 |
| 소규모 프로젝트 (<5 push/주) | Push-based | 즉시 반영, 간단함 |
| 다중 브랜치 운영 | Hybrid + Chaining | 브랜치별 제어, 복잡도 관리 |

---

## 실행 단계 순서

### Phase 1: 환경 준비 및 상태 복원

```yaml
steps:
  # 1-1. 코드 체크아웃
  - name: Checkout code
    uses: actions/checkout@v4
    with:
      fetch-depth: 0  # 전체 히스토리 (증분 업데이트 위해)

  # 1-2. Node.js + pnpm 설정
  - name: Setup pnpm
    uses: pnpm/action-setup@v4
    with:
      version: 10.17.1

  - name: Setup Node.js
    uses: actions/setup-node@v4
    with:
      node-version: '20'
      cache: 'pnpm'

  - name: Install dependencies
    run: pnpm install --frozen-lockfile

  # 1-3. 이전 실행 상태 복원 (중요!)
  - name: Download previous commit state
    uses: actions/download-artifact@v4
    with:
      name: commit-state
      path: .
    continue-on-error: true  # 첫 실행 시 없을 수 있음

  # 1-4. 상태 파일 검증
  - name: Verify commit state
    run: |
      if [ -f "commit-state.json" ]; then
        echo "✅ Found previous commit state"
        cat commit-state.json | jq '.repositories | keys'
      else
        echo "⚠️  No previous state, starting fresh"
        echo '{"repositories":{},"lastUpdated":"'$(date -Iseconds)'"}' > commit-state.json
      fi
```

**체크포인트 1**: 상태 파일 존재 여부
- ✅ 성공: 증분 업데이트 모드
- ⚠️ 실패: 전체 임베딩 모드 (안전)

---

### Phase 2: Supabase Vector Store 준비

```yaml
  # 2-1. Supabase 연결 확인
  - name: Verify Supabase connection
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    run: |
      response=$(curl -s -w "%{http_code}" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        "$SUPABASE_URL/rest/v1/")

      if [ "$response" -ge 200 ] && [ "$response" -lt 300 ]; then
        echo "✅ Supabase connection OK"
      else
        echo "❌ Supabase connection failed (HTTP $response)"
        exit 1
      fi

  # 2-2. 벡터 테이블 초기화 확인 (선택적)
  - name: Check vector store schema
    run: |
      pnpm tsx scripts/verify-supabase-schema.ts
    continue-on-error: true
```

**체크포인트 2**: Supabase 연결
- ✅ 성공: 정상 진행
- ❌ 실패: 워크플로우 중단 (secrets 확인 필요)

---

### Phase 3: 증분 임베딩 실행

```yaml
  # 3-1. 변경 감지 및 임베딩 (Normal Mode)
  - name: Run incremental embedding
    if: ${{ !inputs.reset }}
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    run: |
      echo "🔍 Polling for new commits..."
      pnpm run dev 2>&1 | tee pipeline.log

  # 3-2. 전체 재임베딩 (Reset Mode)
  - name: Run full re-embedding
    if: ${{ inputs.reset }}
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    run: |
      echo "🔄 Force re-embedding all commits..."
      pnpm run dev --reset 2>&1 | tee pipeline.log

  # 3-3. 실행 결과 파싱
  - name: Parse execution results
    id: results
    run: |
      # 로그에서 성공/실패 정보 추출
      success=$(grep -c "✅ Successfully processed" pipeline.log || echo "0")
      failure=$(grep -c "❌ Failed to process" pipeline.log || echo "0")

      echo "success_count=$success" >> $GITHUB_OUTPUT
      echo "failure_count=$failure" >> $GITHUB_OUTPUT

      echo "📊 Results: $success succeeded, $failure failed"
```

**체크포인트 3**: 임베딩 실행
- ✅ 성공 (success > 0): Phase 4로 진행
- ⚠️ 부분 성공 (failure > 0): Phase 4 진행 + 경고
- ❌ 전체 실패 (success = 0): 워크플로우 중단

---

### Phase 4: 상태 저장 및 Artifact 업로드

```yaml
  # 4-1. 새 commit 상태 저장
  - name: Upload commit state artifact
    if: always()  # 실패해도 상태는 저장
    uses: actions/upload-artifact@v4
    with:
      name: commit-state
      path: commit-state.json
      retention-days: 90  # 3개월 보관

  # 4-2. Refined data 백업 (디버깅용)
  - name: Upload refined data
    if: always()
    uses: actions/upload-artifact@v4
    with:
      name: refined-data-${{ github.run_number }}
      path: output/refined_data.json
      retention-days: 30

  # 4-3. 실행 로그 저장
  - name: Upload pipeline logs
    if: failure()
    uses: actions/upload-artifact@v4
    with:
      name: pipeline-logs-${{ github.run_number }}
      path: pipeline.log
      retention-days: 7
```

**체크포인트 4**: Artifact 저장
- ✅ 성공: 다음 실행 시 상태 복원 가능
- ❌ 실패: GitHub Actions 인프라 문제 (드묾)

---

### Phase 5: 파일 내보내기 (Serverless 배포용)

```yaml
# 별도 워크플로우: .github/workflows/export-embeddings.yml

jobs:
  export-to-file:
    runs-on: ubuntu-latest
    steps:
      # 5-1. Supabase → JSON 내보내기
      - name: Export embeddings from Supabase
        run: |
          pnpm tsx scripts/export-embeddings.ts \
            --source supabase \
            --output output/embeddings.json \
            --compress
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

      # 5-2. 파일 크기 및 통계 확인
      - name: Verify export file
        id: verify
        run: |
          if [ ! -f "output/embeddings.json.gz" ]; then
            echo "❌ Export file not found"
            exit 1
          fi

          size=$(stat -f%z "output/embeddings.json.gz" 2>/dev/null || stat -c%s "output/embeddings.json.gz")
          count=$(zcat output/embeddings.json.gz | jq '.embeddings | length')

          echo "size_bytes=$size" >> $GITHUB_OUTPUT
          echo "embedding_count=$count" >> $GITHUB_OUTPUT

          echo "📊 Export stats:"
          echo "   File size: $(numfmt --to=iec $size)"
          echo "   Embeddings: $count"

      # 5-3. Vercel Blob 업로드
      - name: Upload to Vercel Blob
        run: |
          pnpm tsx scripts/upload-to-vercel.ts \
            --file output/embeddings.json.gz \
            --token ${{ secrets.BLOB_READ_WRITE_TOKEN }}

      # 5-4. GitHub Artifacts 백업
      - name: Backup to GitHub Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: embeddings-${{ github.run_number }}
          path: output/embeddings.json.gz
          retention-days: 30
```

**체크포인트 5**: 파일 내보내기
- ✅ 성공: 서비스 배포 준비 완료
- ❌ 실패: Supabase 데이터는 안전, 수동 내보내기 필요

---

### Phase 6: 배포 및 검증

```yaml
  # 6-1. CDN 캐시 무효화 (선택)
  - name: Invalidate CDN cache
    if: success()
    run: |
      curl -X POST "https://api.vercel.com/v1/purge" \
        -H "Authorization: Bearer ${{ secrets.VERCEL_TOKEN }}" \
        -H "Content-Type: application/json" \
        -d '{"url": "https://your-cdn.com/embeddings.json.gz"}'

  # 6-2. 배포 결과 검증
  - name: Verify deployment
    run: |
      # CDN에서 파일 다운로드
      curl -L "https://your-cdn.com/embeddings.json.gz" -o test.json.gz

      # 파일 무결성 확인
      if [ ! -f "test.json.gz" ]; then
        echo "❌ Failed to download from CDN"
        exit 1
      fi

      # JSON 구조 검증
      zcat test.json.gz | jq '.embeddings[0]' > /dev/null

      echo "✅ Deployment verified successfully"

  # 6-3. Slack/Discord 알림 (선택)
  - name: Notify success
    if: success()
    uses: slackapi/slack-github-action@v1
    with:
      payload: |
        {
          "text": "✅ Embedding pipeline completed",
          "blocks": [
            {
              "type": "section",
              "text": {
                "type": "mrkdwn",
                "text": "*Embedding Pipeline Success*\n• Embeddings: ${{ steps.verify.outputs.embedding_count }}\n• File size: ${{ steps.verify.outputs.size_bytes }} bytes\n• Run: <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View logs>"
              }
            }
          ]
        }
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

**체크포인트 6**: 배포 검증
- ✅ 성공: 전체 파이프라인 완료
- ❌ 실패: 파일은 생성됨, 수동 배포 필요

---

## 실패 가능 지점과 방어 전략

### 🔴 Critical Failures (워크플로우 중단)

#### 1. Supabase 연결 실패

**발생 원인**:
- Secret 키 만료/잘못됨
- Supabase 서비스 장애
- 네트워크 타임아웃

**방어 전략**:
```yaml
- name: Verify Supabase with retry
  uses: nick-invision/retry@v2
  with:
    timeout_minutes: 5
    max_attempts: 3
    retry_wait_seconds: 30
    command: |
      curl -f -H "apikey: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
        "${{ secrets.SUPABASE_URL }}/rest/v1/"
```

**복구 방법**:
1. Secrets 확인: `Settings → Secrets → SUPABASE_SERVICE_ROLE_KEY`
2. Supabase 대시보드에서 새 키 생성
3. GitHub Secrets 업데이트
4. 워크플로우 재실행

---

#### 2. OpenAI API 할당량 초과

**발생 원인**:
- API 키 할당량 소진
- Rate limit 초과 (분당 요청 제한)
- 청구 실패

**방어 전략**:
```typescript
// src/embedding-pipeline/nlp/embedding/openaiEmbedding.ts
async function generateEmbeddingWithRetry(text: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text
      });
    } catch (error: any) {
      if (error.status === 429) {
        // Rate limit - exponential backoff
        const waitTime = Math.pow(2, i) * 1000;
        console.log(`⏳ Rate limited, waiting ${waitTime}ms...`);
        await sleep(waitTime);
      } else if (error.status === 402) {
        // Quota exceeded - critical failure
        console.error("❌ OpenAI quota exceeded, cannot continue");
        throw error;
      } else {
        throw error;
      }
    }
  }
}
```

**복구 방법**:
1. OpenAI 대시보드에서 사용량 확인
2. 청구 설정 확인 또는 플랜 업그레이드
3. 임시 대안: Chroma default embedding으로 fallback
4. 워크플로우 재실행

---

#### 3. GitHub Actions Timeout (6시간)

**발생 원인**:
- 대량 커밋 처리 (1000+ commits)
- API rate limit으로 인한 지연
- 네트워크 속도 저하

**방어 전략**:
```yaml
jobs:
  embed:
    timeout-minutes: 300  # 5시간 제한 (6시간 전 종료)
    steps:
      - name: Process with chunking
        run: |
          # 100개씩 청크로 나눠서 처리
          pnpm tsx scripts/embed-in-chunks.ts --chunk-size 100
```

```typescript
// scripts/embed-in-chunks.ts
async function embedInChunks(commits: Commit[], chunkSize = 100) {
  for (let i = 0; i < commits.length; i += chunkSize) {
    const chunk = commits.slice(i, i + chunkSize);
    console.log(`Processing chunk ${i / chunkSize + 1}/${Math.ceil(commits.length / chunkSize)}`);

    await processCommits(chunk);

    // 상태 저장 (중단 시 재시작 가능)
    await saveCheckpoint(i + chunkSize);
  }
}
```

**복구 방법**:
1. Artifact에서 마지막 checkpoint 확인
2. `--resume-from` 옵션으로 재시작
3. 또는 `--reset` 없이 재실행 (증분 업데이트 자동 처리)

---

### 🟡 Non-Critical Failures (계속 진행)

#### 4. 특정 레포지토리 임베딩 실패

**발생 원인**:
- 레포지토리 private 전환
- GitHub token 권한 부족
- 특정 파일 파싱 오류

**방어 전략**:
```typescript
// src/embedding-pipeline/pipelines/runPollingPipeline.ts (이미 구현됨)
for (const result of reposToProcess) {
  try {
    await runPipeline({ targetRepo: result });
    successCount++;
  } catch (error) {
    console.error(`❌ Failed to process ${result.id}:`, error.message);
    failureCount++;
    // Continue with next repository ← 핵심!
  }
}

// 실패가 있어도 commit state는 저장 (성공한 것만)
if (failureCount > 0) {
  process.exit(1);  // 알림 위해 exit code 1
}
```

**복구 방법**:
1. 로그에서 실패한 레포지토리 확인
2. 해당 레포지토리만 수동 실행:
   ```bash
   pnpm tsx scripts/embed-single-repo.ts --owner xxx --repo yyy
   ```
3. 또는 다음 스케줄 실행 시 자동 재시도

---

#### 5. Artifact 업로드 실패

**발생 원인**:
- GitHub Actions 스토리지 용량 초과
- 네트워크 오류

**방어 전략**:
```yaml
- name: Upload commit state with fallback
  id: upload_state
  uses: actions/upload-artifact@v4
  with:
    name: commit-state
    path: commit-state.json
  continue-on-error: true

- name: Fallback to repository commit
  if: steps.upload_state.outcome == 'failure'
  run: |
    # Git으로 상태 파일 커밋 (fallback)
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add commit-state.json
    git commit -m "chore: Update commit state [skip ci]"
    git push
```

**복구 방법**:
- 자동 fallback으로 상태 파일 Git 저장소에 커밋
- 다음 실행 시 파일에서 상태 복원

---

#### 6. 파일 내보내기 실패 (Supabase → JSON)

**발생 원인**:
- Supabase API 타임아웃 (대량 데이터)
- 메모리 부족 (10,000+ embeddings)

**방어 전략**:
```typescript
// scripts/export-embeddings.ts
async function exportFromSupabase(options) {
  const BATCH_SIZE = 1000;
  const allEmbeddings = [];

  let offset = 0;
  while (true) {
    console.log(`Fetching batch: offset ${offset}...`);

    const { data, error } = await supabase
      .from('embeddings')
      .select('*')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allEmbeddings.push(...data);
    offset += BATCH_SIZE;

    // 메모리 압박 방지
    if (offset % 5000 === 0) {
      console.log(`  Progress: ${allEmbeddings.length} embeddings loaded`);
    }
  }

  // 스트림 기반 압축 (메모리 효율)
  await compressAndSave(allEmbeddings, options.outputPath);
}
```

**복구 방법**:
1. 워크플로우 재실행 (`workflow_dispatch`)
2. 로컬 환경에서 수동 내보내기:
   ```bash
   pnpm tsx scripts/export-embeddings.ts --source supabase --upload vercel
   ```

---

#### 7. Vercel Blob 업로드 실패

**발생 원인**:
- Blob token 만료
- Vercel 서비스 장애
- 파일 크기 제한 초과 (500MB)

**방어 전략**:
```typescript
// scripts/upload-to-vercel.ts
import { put } from '@vercel/blob';

async function uploadWithRetry(filePath: string, retries = 3) {
  const fileBuffer = fs.readFileSync(filePath);

  for (let i = 0; i < retries; i++) {
    try {
      const blob = await put('embeddings.json.gz', fileBuffer, {
        access: 'public',
        addRandomSuffix: false
      });

      console.log(`✅ Uploaded to: ${blob.url}`);
      return blob.url;

    } catch (error: any) {
      console.error(`⚠️  Upload attempt ${i + 1} failed:`, error.message);

      if (i === retries - 1) {
        // 최종 실패 시 S3 fallback
        console.log("⚠️  Falling back to S3...");
        return await uploadToS3(filePath);
      }

      await sleep(5000 * (i + 1));  // Exponential backoff
    }
  }
}
```

**복구 방법**:
1. GitHub Artifacts에서 파일 다운로드
2. 로컬에서 수동 업로드:
   ```bash
   pnpm tsx scripts/upload-to-vercel.ts --file embeddings.json.gz
   ```
3. 또는 S3 같은 대안 스토리지 사용

---

### 🟢 Warning Conditions (무시 가능)

#### 8. 증분 업데이트 시 변경 없음

**발생 원인**:
- 새 커밋이 없음
- 이미 최신 상태

**처리**:
```typescript
// src/embedding-pipeline/pipelines/runPollingPipeline.ts (이미 구현됨)
if (reposToProcess.length === 0) {
  console.log("\n✅ All repositories are up to date. Nothing to process.");
  return;  // 정상 종료 (exit code 0)
}
```

**복구 필요 없음**: 정상 동작

---

#### 9. 부분적 임베딩 실패

**발생 원인**:
- 특정 파일 인코딩 오류
- 매우 큰 파일 (>1MB)
- 바이너리 파일 포함

**처리**:
```typescript
try {
  const embedding = await generateEmbedding(content);
  await saveToSupabase(embedding);
} catch (error) {
  console.warn(`⚠️  Skipping file ${filePath}: ${error.message}`);
  // 계속 진행
}
```

**복구 필요 없음**: 핵심 파일만 임베딩되면 충분

---

## 비용 최적화

### GitHub Actions 무료 tier 최대 활용

**무료 한도**:
- Public repo: **무제한**
- Private repo: **월 2,000분** (Team/Enterprise는 더 많음)

**예상 소비 시간** (레포지토리당):
```
체크아웃 + 설정: 2분
임베딩 (100 commits): 5-10분
내보내기 + 업로드: 3분
-----------------------
Total: ~15분/실행
```

**월간 예상**:
- 주 1회 스케줄: `4회 × 15분 = 60분/월` (3% 사용)
- 일 1회 스케줄: `30회 × 15분 = 450분/월` (22.5% 사용)
- Push trigger (일 5회): `150회 × 15분 = 2,250분/월` ⚠️ 초과!

**최적화 전략**:

1. **Concurrency 제어** (동시 실행 방지)
```yaml
concurrency:
  group: embedding-pipeline-${{ github.ref }}
  cancel-in-progress: true  # 이전 실행 취소
```

2. **조건부 실행** (불필요한 실행 skip)
```yaml
on:
  push:
    paths:
      - 'src/**'           # 소스 코드만
      - '!**/*.test.ts'    # 테스트 제외
      - '!**/*.md'         # 문서 제외
```

3. **캐싱 활용** (설정 시간 단축)
```yaml
- name: Cache dependencies
  uses: actions/cache@v3
  with:
    path: ~/.pnpm-store
    key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
```

---

### OpenAI API 비용 최적화

**임베딩 비용** (text-embedding-3-small):
- **$0.020 / 1M tokens** (매우 저렴)

**예상 비용**:
```
100 commits × 평균 500 tokens/commit = 50,000 tokens
50,000 tokens × $0.020 / 1M = $0.001 (0.1센트)

월 1회 실행 → $0.001/월
주 1회 실행 → $0.004/월
일 1회 실행 → $0.03/월
```

**최적화 전략**:

1. **증분 업데이트** (이미 구현됨)
   - 새 커밋만 임베딩
   - 중복 방지: commit-state.json

2. **텍스트 전처리** (토큰 수 감소)
```typescript
function preprocessForEmbedding(text: string): string {
  return text
    .replace(/\s+/g, ' ')           // 공백 정규화
    .replace(/```[\s\S]*?```/g, '')  // 코드 블록 제거
    .substring(0, 8000);            // 최대 길이 제한
}
```

3. **Batch 요청** (비용 동일하지만 속도 향상)
```typescript
const embeddings = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: texts  // 배열로 한번에 요청
});
```

---

### Supabase 비용

**무료 tier**:
- Database: 500MB
- Storage: 1GB
- API 요청: 무제한

**예상 사용량** (1,000 embeddings 기준):
```
Vector store (pgvector):
- 1,000 embeddings × 1536 dimensions × 4 bytes = 6.1MB
- 메타데이터: ~1MB
Total: ~7MB (무료 tier 내)
```

**최적화 전략**:
- 오래된 임베딩 자동 정리 (>6개월)
- 불필요한 메타데이터 제거

---

### Vercel Blob 비용

**무료 tier** (Hobby plan):
- Storage: 1GB
- Bandwidth: 100GB/월

**예상 사용량**:
```
embeddings.json.gz: ~2-5MB (1,000 embeddings)
월간 다운로드: 1,000회 × 3MB = 3GB
```

**비용**: **$0/월** (무료 tier 내)

---

## 운영 가이드

### 초기 설정 체크리스트

```bash
# 1. GitHub Secrets 설정
# Settings → Secrets and variables → Actions → New repository secret

GITHUB_TOKEN              # 자동 제공됨
OPENAI_API_KEY            # OpenAI 대시보드에서 생성
SUPABASE_URL              # https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY # Supabase → Settings → API
BLOB_READ_WRITE_TOKEN     # Vercel Blob 설정

# 2. Workflow 파일 배포
git add .github/workflows/*.yml
git commit -m "ci: Add embedding automation workflows"
git push

# 3. 수동 실행으로 테스트
# Actions → Polling-based Embedding Pipeline → Run workflow
# → inputs.reset = true (첫 실행 시)

# 4. 결과 확인
# Actions → 실행 로그 확인
# Artifacts → commit-state.json 다운로드하여 검증
```

---

### 모니터링

#### 1. GitHub Actions 대시보드

**확인 사항**:
- ✅ Workflow 실행 상태 (성공/실패)
- ⏱️ 실행 시간 (비용 추정)
- 📊 Artifacts 크기 및 보관 기간

**알림 설정**:
```yaml
# .github/workflows/notify-failure.yml
name: Failure Notification

on:
  workflow_run:
    workflows: ["Polling-based Embedding Pipeline"]
    types:
      - completed

jobs:
  notify:
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    runs-on: ubuntu-latest
    steps:
      - name: Send Slack notification
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "❌ Embedding pipeline failed",
              "blocks": [...]
            }
```

---

#### 2. Supabase 모니터링

**SQL 쿼리**:
```sql
-- 임베딩 통계
SELECT
  COUNT(*) as total_embeddings,
  COUNT(DISTINCT metadata->>'owner') as unique_repos,
  MAX(created_at) as last_update
FROM embeddings;

-- 레포지토리별 임베딩 수
SELECT
  metadata->>'owner' as owner,
  metadata->>'repo' as repo,
  COUNT(*) as embedding_count
FROM embeddings
GROUP BY metadata->>'owner', metadata->>'repo'
ORDER BY embedding_count DESC;

-- 최근 24시간 임베딩 수
SELECT COUNT(*)
FROM embeddings
WHERE created_at > NOW() - INTERVAL '24 hours';
```

---

#### 3. OpenAI API 사용량

**대시보드**: https://platform.openai.com/usage

**확인 사항**:
- 일일 사용량 추이
- 예상 월간 비용
- Rate limit 상태

**알림 설정** (OpenAI 대시보드):
- Usage limit: $5/월
- Email alert: 80% 도달 시

---

### 트러블슈팅 플레이북

#### 시나리오 1: "All repositories are up to date" 매번 반복

**원인**: commit-state.json이 업데이트되지 않음

**진단**:
```bash
# Artifacts에서 commit-state.json 다운로드
# 내용 확인
cat commit-state.json | jq .
```

**해결**:
```bash
# 로컬에서 상태 리셋
echo '{"repositories":{},"lastUpdated":"'$(date -Iseconds)'"}' > commit-state.json

# GitHub에 커밋
git add commit-state.json
git commit -m "fix: Reset commit state"
git push

# 또는 workflow dispatch로 --reset=true 실행
```

---

#### 시나리오 2: 임베딩 실행은 성공했는데 파일 내보내기 실패

**원인**: Supabase → JSON 내보내기 오류

**진단**:
```bash
# 로컬에서 내보내기 테스트
pnpm tsx scripts/export-embeddings.ts --source supabase

# Supabase에서 데이터 확인
curl "$SUPABASE_URL/rest/v1/embeddings?select=*&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```

**해결**:
```bash
# 수동 내보내기 및 업로드
pnpm tsx scripts/export-embeddings.ts --source supabase --upload vercel

# 성공 시 URL 확인 및 환경 변수 업데이트
# VECTOR_FILE_URL=https://...
```

---

#### 시나리오 3: Workflow가 6시간 타임아웃

**원인**: 대량 커밋 처리

**진단**:
```bash
# 로그에서 처리 중인 커밋 수 확인
# "Processing chunk X/Y" 메시지 찾기
```

**해결**:
```bash
# 청크 크기 줄이기
# scripts/embed-in-chunks.ts 수정
const CHUNK_SIZE = 50;  // 기존 100 → 50

# 또는 타임아웃 늘리기 (최대 6시간)
# .github/workflows/polling-embed.yml
timeout-minutes: 360
```

---

### 정기 점검 (주 1회)

**체크리스트**:
- [ ] GitHub Actions 실행 로그 확인 (마지막 7일)
- [ ] Artifacts 저장 용량 확인 (<1GB 유지)
- [ ] Supabase 데이터베이스 크기 확인 (<100MB)
- [ ] OpenAI API 사용량 확인 (<$1/주)
- [ ] Vercel Blob 파일 버전 확인 (최신 24시간 내)
- [ ] 서비스 응답 시간 테스트 (ask API)

---

## 요약

### ✅ 권장 구성 (서버 비용 $0)

```yaml
# 1. 트리거: 주 1회 스케줄 + 수동 실행
on:
  schedule:
    - cron: '0 18 * * 6'  # 토요일 밤
  workflow_dispatch:

# 2. 실행 흐름
jobs:
  embed:
    - 상태 복원 (commit-state.json)
    - 증분 임베딩 (pnpm run dev)
    - 상태 저장 (Artifact)

  export:
    needs: embed
    - Supabase → JSON
    - Gzip 압축
    - Vercel Blob 업로드

# 3. 비용
GitHub Actions: 60분/월 (무료)
OpenAI API: $0.004/월 (거의 무료)
Supabase: $0/월 (무료 tier)
Vercel Blob: $0/월 (무료 tier)
--------------------------
Total: ~$0/월
```

### 🎯 핵심 설계 원칙

1. **Idempotent**: 동일 commit 재실행 시 자동 skip
2. **Incremental**: 새 commit만 처리
3. **Resilient**: 실패 시 다음 실행에서 재시도
4. **Observable**: 로그 + Artifacts로 상태 추적
5. **Cost-effective**: 모든 서비스 무료 tier 활용

### 📊 성능 지표

- **Cold start**: 첫 실행 ~15분
- **Incremental**: 새 commit 10개 → ~5분
- **No changes**: ~2분 (skip)
- **Full reset**: 1,000 commits → ~45분

---

**작성일**: 2025-12-31
**버전**: 1.0.0
**관련 문서**: [EMBEDDING-SCHEMA.md](./EMBEDDING-SCHEMA.md), [FILE-BASED-VECTOR-STORE.md](./FILE-BASED-VECTOR-STORE.md)
