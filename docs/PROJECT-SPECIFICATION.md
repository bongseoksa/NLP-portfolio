# NLP-Portfolio 프로젝트 기획서 (최종 보완안)

## 1. 프로젝트 개요

본 프로젝트는 **복수의 GitHub 코드베이스와 사용자 질의응답 데이터**를 자연어로 탐색·분석할 수 있는 NLP 기반 질의응답 시스템을 구현하는 것을 목표로 한다.

서버 비용을 발생시키는 상시 실행 인프라는 운영하지 않으며, **CI 단계에서 생성한 정적 벡터 파일을 서버리스 환경에서 직접 활용하는 구조**를 채택한다.

본 시스템은 실제 서비스 운영이 가능한 구조이면서, 프론트엔드 개발자의 **시스템 설계 역량과 AI 활용 능력을 동시에 증명하는 포트폴리오** 목적을 가진다.

---

## 2. 프로젝트 목표

### 2.1 대목표
- NLP 기반 질의응답 시스템 구현
- 프론트엔드 포트폴리오 활용
- 다중 페이지 기반 UI 제공
  - Q&A 페이지
  - 질의응답 상세 페이지
  - 대시보드 페이지

### 2.2 중간 목표
- 서버리스 환경에서 정적 벡터 파일 기반 질의응답 제공
- **다중 GitHub 리포지토리** 동시 분석 지원 (`portfolio`, `NLP-portfolio`)
- 임베딩 데이터 원본
  - Commit (커밋 메시지 + 메타데이터)
  - Diff (변경 내역)
  - File (소스 코드 전체)
  - Q&A History (이전 질의응답)
- 관계형 데이터 및 메타데이터는 Supabase 사용

### 2.3 소목표
- 사용자 질의응답 원문은 Supabase에 저장
- **주기적인 CI 배치를 통해 신규 커밋 + Q&A 데이터를 임베딩하여 벡터 파일에 병합**
- **이전 질의응답을 컨텍스트로 활용한 연속 질의응답 제공**
- **증분 업데이트**: 새로운 커밋만 임베딩하여 비용 절감 (Idempotent 처리)

---

## 3. 기술 스택

### 프론트엔드
- React + Vite
- TypeScript

### 임베딩 (CI 전용)
**임베딩 모델**: Hugging Face
- `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions)
- **역할**: GitHub 코드, 커밋, diff, Q&A 원문을 의미 벡터로 변환
- **실행 환경**: GitHub Actions CI (로컬 실행 불가)
- **비용**: 무료 (GitHub Actions 무료 티어 내 실행)

### 응답 생성
**LLM 모델 (Fallback Chain)**:
1. **Primary**: Anthropic Claude Sonnet 4 (`claude-sonnet-4-20250514`) - 유료
2. **Fallback 1**: Google Gemini (`gemini-1.5-flash`) - Free tier
3. **Fallback 2**: HuggingFace Mistral-7B-Instruct - 무료 오픈소스
4. **최종**: 에러 메시지 반환 ("현재 응답을 생성할 수 없습니다")

**Fallback 전략**:
- Claude API 실패 시 → Gemini 자동 전환
- Gemini API 실패 시 → Mistral-7B 자동 전환
- 모든 모델 실패 시 → 명확한 에러 메시지 반환
- **목적**: 서비스 가용성 극대화 + 비용 최적화

### 데이터베이스
**Supabase** (PostgreSQL + pgvector extension)
- Q&A 원문 저장 (`qa_history` 테이블)
- 질의응답 히스토리 저장
- 메타데이터 저장
- 임베딩 벡터 임시 저장 (CI 단계 전용)
- **Ping 테이블**: GitHub Actions가 주기적으로 Ping 기록 저장 (Free Tier 유지 목적)

### 벡터 저장 방식 (중요)
**저장 위치**: 단일 GitHub Repository
- 벡터는 데이터베이스가 아닌 **파일 형태** (`embeddings.json.gz`)로 관리
- 런타임 시 외부 벡터 DB 접근 없음
- **GitHub Raw URL**을 통해 직접 제공 (CDN 비용 없음)

---

## 4. 시스템 아키텍처 개요

### 설계 원칙
- ✅ 상시 실행 서버 없음
- ✅ 벡터 DB 서버 운영 없음
- ✅ 임베딩은 CI 단계에서만 수행
- ✅ 런타임은 읽기 전용 구조

---

## 5. 데이터 흐름

### 5.1 데이터 소스
**GitHub API**
- 커밋 이력 (commit message + metadata)
- 변경 diff (patch)
- 파일 내용 (source code)
- **대상 레포지토리**: `portfolio`, `NLP-portfolio` (2개)

**Supabase**
- 사용자 질의응답 원문
- 이전 응답 기록

---

### 5.2 CI 단계 (GitHub Actions)

#### 트리거
- **스케줄 기반**: 매주 토요일 18:00 UTC (일요일 03:00 KST)
- **수동 실행 가능** (`workflow_dispatch`)

#### 처리 절차 (Polling-based Embedding Pipeline)
1. **다중 레포지토리 폴링**
   - `target-repos.json` 파일 기반으로 대상 레포 로드
   - 각 레포의 최신 커밋 SHA 확인
   - `commit-state.json`과 비교하여 **신규 커밋만 감지**

2. **GitHub API 데이터 수집**
   - 신규 커밋 메시지 + 메타데이터
   - 변경된 파일의 diff (patch)
   - 전체 소스 코드 파일 내용

3. **Supabase에서 신규 Q&A 조회**
   - 마지막 CI 실행 이후 생성된 Q&A만 조회

4. **Hugging Face 임베딩 모델 로드**
   - `sentence-transformers/all-MiniLM-L6-v2` 로드
   - **로컬 실행**: GitHub Actions Runner 내부 환경

5. **텍스트 → 벡터 변환**
   - Commit 데이터 임베딩
   - Diff 데이터 임베딩
   - File 데이터 임베딩
   - Q&A 원문 임베딩

6. **벡터 + 메타데이터 구조화**
   - 각 벡터에 메타데이터 태깅 (type, path, sha, author 등)

7. **Supabase pgvector에 저장**
   - `embeddings` 테이블에 insert

8. **벡터 파일 내보내기 (export-embeddings.yml)**
   - Supabase에서 모든 임베딩 조회
   - `embeddings.json.gz` 압축 파일 생성
   - `output/` 디렉토리에 저장

9. **GitHub Repository에 커밋**
   - `[skip ci]` 플래그로 무한 루프 방지
   - 결과 벡터 파일을 리포지토리에 푸시

10. **commit-state.json 업데이트**
    - 각 레포의 마지막 처리 커밋 SHA 기록
    - GitHub Actions Artifacts에 저장 (90일 보관)
    - 다음 실행 시 중복 처리 방지

---

#### CI 단계에서의 "로컬" 실행 환경 정의
CI 단계에서의 **로컬**이란 **GitHub Actions 러너 내부의 임시 실행 환경**을 의미한다.

- ❌ 개인 PC 아님
- ❌ 상시 서버 아님
- ✅ **배치 작업 전용 실행 컨텍스트**

임베딩 모델은 이 환경에서만 로드되며, 결과물은 벡터 파일로 저장된다.

---

### 5.3 런타임 (Vercel Serverless)

1. 사용자 질문 입력
2. **GitHub Repository에 저장된 벡터 파일 로드**
   - `https://raw.githubusercontent.com/{owner}/{repo}/main/output/embeddings.json.gz`
   - 메모리 캐시 (5분 TTL)
3. **벡터 유사도 검색 수행** (Brute-force cosine similarity)
4. **컨텍스트 구성**
   - GitHub 코드 정보 (commit, diff, file)
   - 이전 질의응답 (Q&A history)
5. **LLM을 통해 응답 생성 (Fallback Chain)**
   - 1차 시도: Claude Sonnet 4 (유료, 고품질)
   - 2차 시도: Gemini 1.5 Flash (무료, 중간 품질)
   - 3차 시도: Mistral-7B-Instruct (무료 오픈소스, 기본 품질)
   - 최종 실패: "현재 응답을 생성할 수 없습니다" 메시지 반환
6. **응답 결과를 Supabase에 저장**
   - 다음 CI 실행 시 임베딩 대상에 포함

---

## 6. 질의응답 연속성 설계

### 6.1 Q&A 히스토리 벡터화
- **이전 Q&A는 Supabase `qa_history` 테이블에 저장**
- **CI 배치 시 신규 Q&A를 임베딩하여 벡터 파일에 포함**
- **이후 질의응답 시 과거 Q&A도 검색 대상에 포함**

### 6.2 연속 질의응답 예시
```
사용자: "차트는 뭐로 만들어졌어?"
시스템: "Recharts 라이브러리를 사용했습니다." (Q&A 저장)

[다음 CI 실행 시 위 Q&A 임베딩]

사용자: "그럼 그 라이브러리 어디서 사용돼?"
시스템: (이전 Q&A 컨텍스트 활용) "Recharts는 DashboardPage.tsx에서 사용됩니다."
```

---

## 7. GitHub Actions 워크플로우

### 7.1 Polling-based Embedding Pipeline (`polling-embed.yml`)
- **트리거**: 매주 토요일 18:00 UTC
- **실행 시간**: 최대 5시간
- **기능**:
  - 다중 레포지토리 폴링 (`target-repos.json`)
  - 신규 커밋 감지 (증분 업데이트)
  - Hugging Face 임베딩 생성
  - Supabase에 저장
  - commit-state.json 업데이트

### 7.2 Export Embeddings (`export-embeddings.yml`)
- **트리거**:
  - `polling-embed.yml` 완료 후 자동 실행
  - 매일 0:30 UTC (스케줄)
  - 수동 실행 가능
- **기능**:
  - Supabase에서 모든 임베딩 조회
  - `embeddings.json.gz` 압축 파일 생성
  - Git 커밋 및 푸시
  - GitHub Artifacts 백업 (30일 보관)

### 7.3 Supabase Ping (`supabase-ping.yml`)
- **트리거**: 매주 일요일 24:00 (UTC 15:00)
- **목적**: **Supabase Free Tier 유지**
  - Supabase Free Tier는 7일 이상 비활성 시 일시정지
  - 주기적 Ping으로 프로젝트 활성 상태 유지
- **기능**:
  - Supabase `/rest/v1/` Health Check
  - `ping` 테이블에 응답 시간 및 상태 기록
  - 실패 시 GitHub Actions 경고

---

## 8. 다중 레포지토리 지원

### 8.1 target-repos.json 구조
```json
{
  "repositories": [
    {
      "owner": "username",
      "repo": "portfolio",
      "enabled": true,
      "description": "포트폴리오 웹사이트"
    },
    {
      "owner": "username",
      "repo": "NLP-portfolio",
      "enabled": true,
      "description": "NLP 기반 Q&A 시스템"
    }
  ]
}
```

### 8.2 증분 업데이트 메커니즘
**commit-state.json** 구조:
```json
{
  "repositories": {
    "username/portfolio": {
      "id": "username/portfolio",
      "owner": "username",
      "repo": "portfolio",
      "defaultBranch": "main",
      "lastProcessedCommit": "abc123def456",
      "lastProcessedAt": "2026-01-01T15:00:00Z",
      "totalCommitsProcessed": 150
    },
    "username/NLP-portfolio": {
      "id": "username/NLP-portfolio",
      "owner": "username",
      "repo": "NLP-portfolio",
      "defaultBranch": "main",
      "lastProcessedCommit": "xyz789uvw012",
      "lastProcessedAt": "2026-01-01T15:05:00Z",
      "totalCommitsProcessed": 80
    }
  },
  "lastUpdated": "2026-01-01T15:10:00Z"
}
```

**동작 원리**:
1. CI 실행 시 `commit-state.json` 로드
2. 각 레포의 최신 커밋 SHA와 `lastProcessedCommit` 비교
3. 신규 커밋만 임베딩 생성 (이미 처리된 커밋 skip)
4. 처리 완료 후 `commit-state.json` 업데이트

---

## 9. LLM 응답 생성 Fallback 전략

### 9.1 Anthropic Claude Sonnet 4 (Primary)
- **모델**: `claude-sonnet-4-20250514`
- **비용**: 유료 ($3/1M input tokens, $15/1M output tokens)
- **장점**:
  - 가장 높은 답변 품질
  - 한국어 지원 우수
  - 긴 컨텍스트 처리 가능 (200K tokens)
- **실패 조건**:
  - API 키 없음
  - Rate limit 초과
  - 네트워크 오류

### 9.2 Google Gemini 1.5 Flash (Fallback 1)
- **모델**: `gemini-1.5-flash`
- **비용**: 무료 (Free tier: 15 RPM, 1M TPM)
- **장점**:
  - 무료 티어 제공
  - 빠른 응답 속도
  - 한국어 지원 양호
- **실패 조건**:
  - API 키 없음
  - Free tier quota 초과
  - 네트워크 오류

### 9.3 HuggingFace Mistral-7B-Instruct (Fallback 2)
- **모델**: `mistralai/Mistral-7B-Instruct-v0.2`
- **비용**: 무료 (HuggingFace Inference API)
- **장점**:
  - 완전 무료
  - 오픈소스
  - API 키 필요 없음 (또는 무료 tier)
- **단점**:
  - 한국어 성능 제한적
  - 응답 품질 낮음
  - Cold start 지연 가능
- **실패 조건**:
  - HuggingFace API 장애
  - 네트워크 오류

### 9.4 최종 에러 메시지
- **메시지**: "현재 응답을 생성할 수 없습니다. 잠시 후 다시 시도해주세요."
- **조건**: 모든 LLM 모델 실패
- **추가 정보**:
  - 에러 로그 저장 (Supabase)
  - 사용자에게 재시도 안내

---

## 10. 리스크 및 대응 전략

### 10.1 벡터 파일 크기 증가
**현재 대응**:
- gzip 압축 (`embeddings.json.gz`)
- GitHub Repository는 100MB 파일까지 지원

**향후 확장 시**:
- 데이터 유형별 파일 분리
  - `github-vectors.json.gz` (commit, diff, file)
  - `qa-vectors.json.gz` (Q&A history)
- Git LFS 사용 고려
- 외부 스토리지로 이전 (S3, Vercel Blob 등)

### 10.2 GitHub Repository에 벡터 파일 커밋
**장점**:
- 포트폴리오 목적에 적합한 단일 레포 관리
- 구조 단순화 우선
- CDN 비용 없음 (GitHub Raw URL 무료)

**단점 및 대응**:
- Git 히스토리 증가 → Git LFS 또는 외부 스토리지로 이전 가능
- 확장 시 외부 스토리지 마이그레이션 용이 (URL만 변경)

### 10.3 Supabase Free Tier 제한
**대응**:
- Supabase Ping GitHub Actions (`supabase-ping.yml`)
- 매주 자동 실행으로 프로젝트 비활성화 방지

### 10.4 CI 실행 시간 초과
**현재**:
- Timeout: 5시간 (GitHub Actions 무료 티어: 6시간)

**대응**:
- 증분 업데이트로 처리 시간 최소화
- 대량 커밋 발생 시 수동 분할 실행

### 10.5 LLM API 장애
**리스크**:
- Claude API 장애 또는 비용 초과
- Gemini Free tier quota 소진

**대응**:
- 3단계 Fallback 체계 구축
- Mistral-7B로 최소 서비스 가용성 보장
- API 사용량 모니터링 (Supabase 로그)

**비용 최적화 전략**:
- Claude: 주요 사용자 요청만 사용 (고품질 필요 시)
- Gemini: 일반 질문 처리 (Free tier 우선 활용)
- Mistral-7B: 긴급 fallback (품질보다 가용성 우선)

---

## 11. Supabase Ping GitHub Actions 상세

### 11.1 목적
Supabase Free Tier는 **7일 이상 비활성 시 프로젝트가 일시정지**된다.
이를 방지하기 위해 주기적으로 Supabase에 Ping을 전송하여 **프로젝트를 활성 상태로 유지**한다.

### 11.2 GitHub Actions 워크플로우 (`supabase-ping.yml`)

```yaml
name: Supabase Ping

on:
  schedule:
    # 매주 일요일 24:00 (UTC 15:00, 한국시간 24:00)
    - cron: '0 15 * * 0'
  workflow_dispatch: # 수동 실행 가능

jobs:
  ping:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          npm install -g pnpm
          pnpm install --frozen-lockfile

      - name: Ping Supabase
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          node -e "
          const startTime = Date.now();
          const supabaseUrl = process.env.SUPABASE_URL;
          const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          const healthUrl = supabaseUrl + '/rest/v1/';
          const pingUrl = supabaseUrl + '/rest/v1/ping';

          fetch(healthUrl, {
            headers: {
              'apikey': apiKey,
              'Authorization': 'Bearer ' + apiKey
            }
          })
          .then(async (res) => {
            const responseTime = Date.now() - startTime;
            const status = res.ok ? 'success' : 'error';
            const errorMessage = res.ok ? null : await res.text();

            console.log('Health check:', status, 'HTTP', res.status, responseTime + 'ms');

            // ping 테이블에 결과 저장
            return fetch(pingUrl, {
              method: 'POST',
              headers: {
                'apikey': apiKey,
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                status: status,
                http_code: res.status,
                response_time_ms: responseTime,
                error_message: errorMessage,
                triggered_by: 'github_actions'
              })
            });
          })
          .then(async (res) => {
            if (res.ok) {
              console.log('✅ Ping recorded successfully');
              process.exit(0);
            } else {
              const errorText = await res.text();
              console.error('❌ Failed to record ping:', res.status, errorText);
              process.exit(1);
            }
          })
          .catch((err) => {
            console.error('❌ Ping failed:', err.message);
            process.exit(1);
          });
          "

      - name: Notify on failure
        if: failure()
        run: |
          echo "::warning::Supabase ping check failed. Please check the logs."
```

### 11.3 Supabase 테이블 스키마 (`ping`)

```sql
CREATE TABLE ping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,               -- 'success' or 'error'
  http_code INTEGER,                  -- HTTP 응답 코드
  response_time_ms INTEGER,           -- 응답 시간 (밀리초)
  error_message TEXT,                 -- 에러 메시지 (있을 경우)
  triggered_by TEXT DEFAULT 'github_actions'
);

-- Index for faster queries
CREATE INDEX idx_ping_created_at ON ping(created_at DESC);
```

### 11.4 동작 원리
1. **매주 일요일 24:00 (한국시간) 자동 실행**
2. Supabase `/rest/v1/` 엔드포인트에 Health Check 요청
3. 응답 시간 및 상태 측정
4. `ping` 테이블에 결과 기록
5. 실패 시 GitHub Actions 경고 메시지 출력

### 11.5 기대 효과
- ✅ Supabase Free Tier 프로젝트 비활성화 방지
- ✅ 연결 상태 모니터링 (ping 테이블 조회 가능)
- ✅ 장애 조기 감지 (실패 시 경고)

---

## 12. 프로젝트 기대 효과

✅ **서버 비용 없이 NLP 시스템 운영**
- GitHub Actions 무료 티어 활용
- Vercel Serverless 무료 티어 활용
- Supabase Free Tier 유지 (Ping 자동화)

✅ **서버리스 환경에서 RAG 구조 구현**
- 정적 벡터 파일 기반 검색
- 메모리 캐시로 성능 최적화

✅ **CI 기반 임베딩 파이프라인 설계 경험 확보**
- GitHub Actions 워크플로우 설계
- 증분 업데이트 메커니즘 구현
- Idempotent 처리 (재실행 안전성)

✅ **AI 시스템 설계 역량 증명**
- 임베딩·검색·응답 생성의 역할 분리
- 3단계 Fallback 전략 설계 (Claude → Gemini → Mistral)
- 다중 레포지토리 동시 분석

✅ **연속 질의응답 지원**
- Q&A 히스토리 벡터화
- 이전 대화 컨텍스트 활용

✅ **비용 최적화**
- Hugging Face 오픈소스 임베딩 모델 사용
- Gemini Free tier 우선 활용
- Mistral-7B 최종 fallback

---

## 13. 결론

본 프로젝트는 다음을 충족한다:

✅ **실제 동작 가능한 NLP 시스템**
✅ **비용 효율적인 서버리스 구조** (월 $0 ~ 최소 비용)
✅ **임베딩·검색·응답 생성의 역할 분리**
✅ **다중 레포지토리 동시 분석 지원**
✅ **증분 업데이트 메커니즘** (Idempotent)
✅ **연속 질의응답 지원** (Q&A 히스토리 벡터화)
✅ **Supabase Free Tier 자동 유지** (Ping Actions)
✅ **3단계 LLM Fallback** (가용성 극대화)
✅ **포트폴리오로 명확히 설명 가능한 설계 판단**

AI 모델 사용 여부가 아닌, **AI 시스템을 어떻게 설계하고 운영했는지를 보여주는 프로젝트**로 정의한다.
