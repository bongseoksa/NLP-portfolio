# Supabase Ping 처리 액션 요약

## 파일 위치
- **GitHub Actions 워크플로우**: `.github/workflows/supabase-ping.yml`
- **서버 헬스체크**: `src/server/routes/health.ts`
- **Supabase 연결 확인**: `src/server/services/supabase.ts`

## 주요 기능

### 1. GitHub Actions 워크플로우 (`.github/workflows/supabase-ping.yml`)

**목적**: Supabase 무료 티어의 자동 일시정지 방지를 위한 주기적 ping

**실행 주기**: 매주 일요일 24:00 (UTC 15:00, 한국시간 24:00)

**주요 단계**:
1. 레포지토리 체크아웃
2. Node.js 20 설정
3. 의존성 설치 (pnpm)
4. Supabase Ping 실행:
   - `SUPABASE_URL/rest/v1/` 엔드포인트로 헬스체크
   - 응답 시간 측정
   - 결과를 `ping` 테이블에 저장:
     - `status`: 'success' 또는 'error'
     - `http_code`: HTTP 상태 코드
     - `response_time_ms`: 응답 시간 (밀리초)
     - `error_message`: 오류 메시지 (있는 경우)
     - `triggered_by`: 'github_actions'

**핵심 코드**:
```javascript
const healthUrl = supabaseUrl + '/rest/v1/';
const pingUrl = supabaseUrl + '/rest/v1/ping';

// 헬스체크
fetch(healthUrl, {
  headers: {
    'apikey': apiKey,
    'Authorization': 'Bearer ' + apiKey
  }
})
.then(async (res) => {
  const responseTime = Date.now() - startTime;
  const status = res.ok ? 'success' : 'error';
  
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
});
```

### 2. 서버 헬스체크 (`src/server/routes/health.ts`)

**엔드포인트**: `GET /api/health`

**기능**:
- Supabase 연결 상태 확인 (캐싱 적용, 1분 TTL)
- `checkSupabaseConnection()` 함수 사용
- 응답 형식:
  ```json
  {
    "status": "ok",
    "timestamp": "2025-12-24T...",
    "services": {
      "api": "online",
      "supabase": "connected" | "disconnected"
    }
  }
  ```

**캐싱 메커니즘**:
- 1분간 캐시 유지
- 캐시가 없거나 만료되면 실제 연결 확인
- `supabaseCache` 객체로 상태 관리

### 3. Supabase 연결 확인 함수 (`src/server/services/supabase.ts`)

**함수**: `checkSupabaseConnection()`

**구현**:
```typescript
export async function checkSupabaseConnection(): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
        const { error } = await client.from('qa_history').select('id').limit(1);
        return !error;
    } catch {
        return false;
    }
}
```

**동작 방식**:
1. Supabase 클라이언트 가져오기
2. `qa_history` 테이블에서 간단한 쿼리 실행 (`select('id').limit(1)`)
3. 오류가 없으면 `true`, 있으면 `false` 반환

## 데이터베이스 스키마

**ping 테이블** (Supabase):
```sql
CREATE TABLE IF NOT EXISTS public.ping (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  http_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  error_message TEXT,
  triggered_by TEXT DEFAULT 'github_actions' NOT NULL
);
```

## 요약

1. **GitHub Actions**: 주기적으로 Supabase에 ping을 보내서 자동 일시정지 방지
2. **서버 헬스체크**: API 서버에서 Supabase 연결 상태를 확인하고 캐싱
3. **연결 확인 함수**: 간단한 쿼리로 Supabase 연결 상태 확인

이 세 가지 메커니즘이 함께 작동하여 Supabase의 가용성을 보장합니다.
