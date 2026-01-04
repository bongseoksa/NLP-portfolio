# Vercel 자동 배포 가이드

> **문서 버전**: v1.0
> **최종 업데이트**: 2026-01-03

---

## 목차

1. [개요](#1-개요)
2. [자동 배포 설정](#2-자동-배포-설정)
3. [배포 트리거 조건](#3-배포-트리거-조건)
4. [환경 변수 설정](#4-환경-변수-설정)
5. [배포 검증](#5-배포-검증)
6. [트러블슈팅](#6-트러블슈팅)

---

## 1. 개요

### 1.1 Vercel 자동 배포 동작 원리

Vercel은 GitHub와 연동되어 **자동으로 배포**를 수행합니다:

1. **GitHub 연동**: Vercel 프로젝트에 GitHub 저장소 연결
2. **자동 감지**: `main` 브랜치에 push 시 자동으로 배포 시작
3. **빌드 및 배포**: Vercel이 코드를 빌드하고 Serverless Functions로 배포
4. **URL 제공**: 배포 완료 후 프로덕션 URL 자동 생성

### 1.2 배포 아키텍처

```
GitHub Repository (main branch)
    │
    │ push
    ▼
Vercel (자동 감지)
    │
    │ 빌드
    ▼
┌─────────────────────────────────────┐
│  Serverless Functions (api/**/*.ts)  │
│  - /api/ask                          │
│  - /api/health                       │
│  - /api/history                      │
│  - /api/dashboard                    │
│  - ... (총 15개 엔드포인트)          │
└─────────────────────────────────────┘
    │
    │ 배포
    ▼
Production URL (https://your-project.vercel.app)
```

---

## 2. 자동 배포 설정

### 2.1 Vercel 프로젝트 생성

1. **Vercel 대시보드 접속**
   - https://vercel.com/dashboard

2. **새 프로젝트 추가**
   - "Add New..." → "Project" 클릭

3. **GitHub 저장소 선택**
   - GitHub 계정 연동 (최초 1회)
   - 저장소 선택: `NLP-portfolio`

4. **프로젝트 설정**
   ```
   Framework Preset: Other
   Root Directory: ./
   Build Command: (비워둠 - Serverless Functions만 사용)
   Output Directory: (비워둠)
   Install Command: pnpm install
   ```

### 2.2 GitHub 연동 확인

Vercel은 GitHub와 연동되면 자동으로 다음을 수행합니다:

- ✅ **Webhook 설정**: GitHub push 이벤트 수신
- ✅ **자동 배포**: `main` 브랜치 push 시 자동 배포
- ✅ **Preview 배포**: Pull Request 생성 시 Preview URL 생성
- ✅ **배포 상태**: GitHub에 배포 상태 표시

### 2.3 vercel.json 설정

프로젝트 루트의 `vercel.json` 파일이 배포 설정을 정의합니다:

```json
{
  "version": 2,
  "name": "nlp-portfolio-api",
  "functions": {
    "api/**/*.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Credentials", "value": "true" },
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,OPTIONS,POST,PUT,DELETE" },
        { "key": "Access-Control-Allow-Headers", "value": "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-Type" }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/api/_lib/:path*",
      "destination": "/404"
    }
  ]
}
```

**설정 설명**:
- `functions`: Serverless Functions 메모리 및 타임아웃 설정
- `headers`: CORS 헤더 설정 (프론트엔드에서 API 호출 허용)
- `rewrites`: 내부 라이브러리 접근 차단

---

## 3. 배포 트리거 조건

### 3.1 자동 배포 트리거

다음 상황에서 자동 배포가 실행됩니다:

| 트리거 | 조건 | 배포 타입 |
|--------|------|----------|
| **Push to main** | `main` 브랜치에 push | Production |
| **Pull Request** | PR 생성/업데이트 | Preview |
| **수동 배포** | Vercel 대시보드에서 "Redeploy" | Production/Preview |

### 3.2 배포 제외 조건

다음 파일/디렉토리 변경은 배포를 트리거하지 않습니다:

- `.gitignore`에 포함된 파일
- `docs/` 디렉토리 (문서만 변경)
- `README.md` (루트 문서만 변경)
- `.md` 파일만 변경된 경우 (Vercel이 자동 감지)

**참고**: Vercel은 `api/` 디렉토리 변경을 감지하면 자동으로 재배포합니다.

---

## 4. 환경 변수 설정

### 4.1 Vercel 대시보드에서 설정

1. **프로젝트 설정**
   - Vercel 대시보드 → 프로젝트 선택 → Settings → Environment Variables

2. **환경 변수 추가**

```bash
# Supabase 연결
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# LLM API Keys
OPENAI_API_KEY=sk-proj-xxx
CLAUDE_API_KEY=sk-ant-xxx

# 벡터 파일 경로 (GitHub Raw URL)
VECTOR_FILE_URL=https://raw.githubusercontent.com/owner/repo/main/output/embeddings.json.gz

# 프론트엔드 빌드 환경
VITE_API_URL=https://your-api.vercel.app
NODE_ENV=production
```

### 4.2 환경별 변수 설정

Vercel은 환경별로 변수를 설정할 수 있습니다:

- **Production**: 프로덕션 배포에만 적용
- **Preview**: Preview 배포에만 적용
- **Development**: 로컬 개발에만 적용

**권장 설정**:
- Production: 모든 환경 변수 설정
- Preview: Production과 동일 (테스트 목적)
- Development: 로컬 `.env` 파일 사용

### 4.3 환경 변수 확인

배포 후 환경 변수가 올바르게 설정되었는지 확인:

```bash
# Vercel CLI로 확인 (로컬)
vercel env ls

# 또는 배포된 함수에서 로그 확인
# Vercel 대시보드 → Deployments → 함수 로그
```

---

## 5. 배포 검증

### 5.1 배포 상태 확인

1. **Vercel 대시보드**
   - Deployments 탭에서 배포 상태 확인
   - ✅ 성공: 초록색 체크마크
   - ❌ 실패: 빨간색 X 표시 (로그 확인)

2. **GitHub 상태**
   - GitHub 저장소 → Actions 탭
   - Vercel 배포 상태가 표시됨 (연동된 경우)

### 5.2 API 엔드포인트 테스트

배포 완료 후 다음 엔드포인트를 테스트합니다:

```bash
# Health Check
curl https://your-project.vercel.app/api/health

# Status Check
curl https://your-project.vercel.app/api/health/status

# Q&A 테스트
curl -X POST https://your-project.vercel.app/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "프로젝트의 기술스택은?"}'
```

### 5.3 배포 로그 확인

Vercel 대시보드에서 배포 로그를 확인할 수 있습니다:

1. **Deployments** → 배포 선택
2. **Functions** 탭에서 각 함수의 로그 확인
3. **Build Logs**에서 빌드 과정 확인

**확인 항목**:
- ✅ 빌드 성공 여부
- ✅ 환경 변수 로드 여부
- ✅ 함수 컴파일 성공 여부
- ⚠️ 경고 메시지 (타임아웃, 메모리 사용량 등)

---

## 6. 트러블슈팅

### 6.1 배포 실패

#### 문제: "Build Failed"

**원인**:
- TypeScript 컴파일 에러
- 의존성 설치 실패
- 환경 변수 누락

**해결**:
1. 로컬에서 빌드 테스트:
   ```bash
   pnpm install
   pnpm run build
   ```
2. TypeScript 에러 확인:
   ```bash
   npx tsc --noEmit
   ```
3. 환경 변수 확인 (Vercel 대시보드)

#### 문제: "Function Timeout"

**원인**:
- 함수 실행 시간이 60초 초과
- 벡터 파일 로딩 시간 과다

**해결**:
1. `vercel.json`에서 `maxDuration` 증가 (Pro 플랜 필요):
   ```json
   {
     "functions": {
       "api/**/*.ts": {
         "maxDuration": 300  // 5분 (Pro 플랜)
       }
     }
   }
   ```
2. 벡터 파일 캐싱 최적화
3. 함수 로직 최적화 (불필요한 작업 제거)

#### 문제: "Memory Limit Exceeded"

**원인**:
- 벡터 파일이 메모리에 로드되어 메모리 초과

**해결**:
1. `vercel.json`에서 메모리 증가:
   ```json
   {
     "functions": {
       "api/**/*.ts": {
         "memory": 3008  // 최대 메모리 (Pro 플랜)
       }
     }
   }
   ```
2. 벡터 파일 크기 최적화
3. 스트리밍 방식으로 벡터 로딩

### 6.2 환경 변수 문제

#### 문제: "Environment variable not found"

**원인**:
- 환경 변수가 Vercel에 설정되지 않음
- 환경별 변수 설정 오류

**해결**:
1. Vercel 대시보드에서 환경 변수 확인
2. Production 환경에 변수 설정 확인
3. 변수 이름 오타 확인 (대소문자 구분)

#### 문제: "Vector file URL not configured"

**원인**:
- `VECTOR_FILE_URL` 환경 변수 누락

**해결**:
1. GitHub Raw URL 생성:
   ```
   https://raw.githubusercontent.com/owner/repo/main/output/embeddings.json.gz
   ```
2. Vercel에 `VECTOR_FILE_URL` 환경 변수 추가
3. 배포 재시도

### 6.3 CORS 문제

#### 문제: "CORS policy blocked"

**원인**:
- 프론트엔드와 API 도메인이 다름
- CORS 헤더 설정 오류

**해결**:
1. `vercel.json`의 CORS 헤더 확인
2. 프론트엔드 `VITE_API_URL` 확인
3. 브라우저 개발자 도구에서 실제 요청 헤더 확인

### 6.4 배포 속도 문제

#### 문제: 배포가 느림

**원인**:
- 의존성 설치 시간 과다
- 빌드 시간 과다

**해결**:
1. **의존성 캐싱**: Vercel이 자동으로 캐싱 (pnpm 사용 시)
2. **빌드 최적화**: 불필요한 빌드 단계 제거
3. **함수 최적화**: Cold start 시간 단축

**예상 배포 시간**:
- 첫 배포: 2-5분 (의존성 설치 포함)
- 재배포: 30초-2분 (캐시 활용)

---

## 7. 모니터링

### 7.1 배포 이력 확인

Vercel 대시보드에서 배포 이력을 확인할 수 있습니다:

- **Deployments**: 모든 배포 이력
- **Analytics**: 함수 호출 통계
- **Logs**: 실시간 함수 로그

### 7.2 성능 모니터링

Vercel은 다음 메트릭을 제공합니다:

- **Function Invocations**: 함수 호출 횟수
- **Function Duration**: 함수 실행 시간
- **Function Errors**: 에러 발생 횟수
- **Bandwidth**: 데이터 전송량

### 7.3 알림 설정

Vercel은 다음 이벤트에 대해 알림을 보낼 수 있습니다:

- 배포 성공/실패
- 함수 에러 발생
- 사용량 한도 초과

**설정 경로**: Vercel 대시보드 → Settings → Notifications

---

## 8. 관련 문서

- [GitHub Actions 워크플로우](./01_Workflows.md)
- [환경 변수 설정](../02_architecture/02_Environment_Variables.md)
- [시스템 아키텍처](../02_architecture/01_System_Architecture.md)

---

**문서 작성 완료**: 2026-01-03

