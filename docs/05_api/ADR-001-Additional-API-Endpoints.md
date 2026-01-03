# ADR-001: 추가 API 엔드포인트 설계

**상태**: 승인됨  
**날짜**: 2024-01-15  
**결정자**: 개발팀  
**관련 마일스톤**: Milestone 3 - 서버리스 API 서버

## 컨텍스트

Q&A 질의응답 시스템의 핵심 기능인 `POST /api/ask` 엔드포인트 외에도, 시스템 모니터링, 히스토리 관리, 대시보드 분석을 위한 추가 API 엔드포인트가 필요했습니다.

## 결정사항

다음 7개의 추가 API 엔드포인트를 구현하기로 결정했습니다:

1. **Health Check APIs** (3개)
   - `GET /api/health` - 기본 헬스체크
   - `GET /api/health/chromadb` - ChromaDB 상태 확인
   - `GET /api/health/status` - 모든 서비스 상태 통합 조회

2. **History APIs** (3개)
   - `GET /api/history` - Q&A 히스토리 조회
   - `GET /api/history/:id` - 특정 이력 조회
   - `GET /api/history/session/:sessionId` - 세션별 대화 이력 조회

3. **Dashboard APIs** (4개)
   - `GET /api/dashboard/summary` - 대시보드 요약 통계
   - `GET /api/dashboard/daily` - 일별 통계
   - `GET /api/dashboard/categories` - 카테고리 분포
   - `GET /api/dashboard/sources` - 소스 기여도

## 상세 설계 결정

### 1. Health Check APIs

#### 1.1 GET /api/health

**목적**: API 서버 기본 상태 확인

**설계 결정:**
- **캐싱 전략**: Supabase 연결 상태를 1분간 캐싱하여 불필요한 DB 호출 최소화
- **응답 형식**: 간단한 JSON 구조로 서비스 상태만 반환
- **에러 처리**: Supabase 연결 실패 시에도 API 서버는 정상 응답

**구현:**
```typescript
router.get('/', async (_req: Request, res: Response) => {
    // 캐시 확인 (1분 TTL)
    const supabaseConnected = await checkSupabaseConnection();
    
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            api: 'online',
            supabase: supabaseConnected ? 'connected' : 'disconnected',
        },
    });
});
```

**이유:**
- 모니터링 도구에서 빠른 헬스체크가 필요
- 캐싱으로 DB 부하 감소
- API 서버 자체는 항상 정상 응답 (서비스 의존성과 분리)

#### 1.2 GET /api/health/chromadb

**목적**: ChromaDB 서버 상태 확인 (로컬 개발용)

**설계 결정:**
- **타임아웃**: 2초로 제한하여 빠른 실패
- **캐싱**: 1분간 캐싱
- **Fallback**: v2 API 실패 시 v1 API 시도

**구현:**
```typescript
async function checkChromaDBHealth(): Promise<boolean> {
    // v2 API 시도 → 실패 시 v1 API fallback
    const v2Result = await checkEndpoint('/api/v2/heartbeat');
    if (v2Result) return true;
    
    return await checkEndpoint('/api/v1/heartbeat');
}
```

**이유:**
- ChromaDB는 로컬 개발에서만 사용 (선택적)
- 서버리스 환경에서는 사용 불가
- 빠른 타임아웃으로 응답 지연 방지

#### 1.3 GET /api/health/status

**목적**: 모든 서비스 상태 통합 조회

**설계 결정:**
- **통합 응답**: ChromaDB, API, Supabase 상태를 한 번에 반환
- **캐싱**: 각 서비스별로 1분 캐싱
- **구조화된 응답**: 서비스별로 명확한 상태 정보 제공

**구현:**
```typescript
router.get('/status', async (_req: Request, res: Response) => {
    const [supabaseConnected, chromadbConnected] = await Promise.all([
        checkSupabaseConnection(),
        checkChromaDBHealth()
    ]);
    
    res.json({
        chromadb: { status: chromadbConnected ? 'running' : 'stopped' },
        api: { status: 'running' },
        supabase: { status: supabaseConnected ? 'connected' : 'disconnected' },
    });
});
```

**이유:**
- 프론트엔드 Settings 페이지에서 한 번의 요청으로 모든 상태 확인
- 병렬 처리로 응답 시간 최소화

---

### 2. History APIs

#### 2.1 GET /api/history

**목적**: Q&A 히스토리 목록 조회

**설계 결정:**
- **쿼리 파라미터**: `search`, `category`, `limit`, `offset` 지원
- **기본값**: limit=50, offset=0
- **데이터 변환**: snake_case → camelCase 변환 (프론트엔드 호환성)
- **에러 처리**: 실패 시 빈 배열 반환 (부분 실패 허용)

**구현:**
```typescript
router.get('/', async (req: Request, res: Response) => {
    const { search, category, limit = 50, offset = 0 } = req.query;
    
    const history = await getQAHistory({
        search: search as string,
        category: category as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
    });
    
    // snake_case → camelCase 변환
    const transformedHistory = history.map(transformRecord);
    
    res.json(transformedHistory);
});
```

**이유:**
- 프론트엔드에서 검색 및 필터링 기능 필요
- 페이지네이션으로 대량 데이터 처리
- camelCase 변환으로 프론트엔드 타입 일관성 유지

#### 2.2 GET /api/history/:id

**목적**: 특정 Q&A 이력 상세 조회

**설계 결정:**
- **에러 처리**: 404 (Not Found) 반환
- **데이터 변환**: 동일하게 camelCase 변환

**이유:**
- 개별 이력 상세 보기 기능
- 프론트엔드에서 특정 질문/답변 조회

#### 2.3 GET /api/history/session/:sessionId

**목적**: 세션별 대화 이력 조회

**설계 결정:**
- **세션 기반**: sessionId로 그룹화된 대화 조회
- **시간순 정렬**: 최신순으로 반환

**이유:**
- 대화 맥락 유지 (이전 질문/답변 참조)
- 세션별 대화 히스토리 표시

---

### 3. Dashboard APIs

#### 3.1 GET /api/dashboard/summary

**목적**: 대시보드 요약 통계

**설계 결정:**
- **통계 항목**: 
  - 전체 질문 수
  - 성공률 / 실패률
  - 평균 응답 시간
  - 오늘 질문 수
  - 일일/전체 토큰 사용량
- **계산 방식**: Supabase에서 전체 데이터 조회 후 클라이언트 측 계산
- **에러 처리**: 실패 시 기본값(0) 반환

**구현:**
```typescript
export async function getDashboardStats() {
    const { data } = await client
        .from('qa_history')
        .select('status, response_time_ms, token_usage, created_at');
    
    // 클라이언트 측 계산
    const totalQuestions = data.length;
    const successCount = data.filter(r => r.status === 'success').length;
    const avgResponseTime = data.reduce((sum, r) => sum + r.response_time_ms, 0) / totalQuestions;
    
    return {
        totalQuestions,
        successRate: (successCount / totalQuestions) * 100,
        averageResponseTimeMs: Math.round(avgResponseTime),
        // ...
    };
}
```

**이유:**
- 대시보드 메인 페이지에서 한 번에 요약 정보 표시
- 클라이언트 측 계산으로 DB 쿼리 단순화
- 실패해도 기본값으로 UI 정상 표시

#### 3.2 GET /api/dashboard/daily

**목적**: 일별 통계 (시계열 데이터)

**설계 결정:**
- **쿼리 파라미터**: `startDate`, `endDate` (선택적)
- **기본값**: 최근 30일
- **응답 형식**: 날짜별 통계 배열

**구현:**
```typescript
app.get('/api/dashboard/daily', async (req, res) => {
    const { startDate, endDate } = req.query;
    const stats = await getDailyStats(startDate, endDate);
    res.json(stats);
});
```

**이유:**
- 차트 라이브러리(Recharts)에서 시계열 데이터 필요
- 날짜 범위 필터링으로 유연한 분석 지원

#### 3.3 GET /api/dashboard/categories

**목적**: 카테고리별 질문 분포

**설계 결정:**
- **집계 방식**: Supabase에서 GROUP BY로 카테고리별 카운트
- **응답 형식**: 카테고리명과 개수 배열

**이유:**
- 도넛 차트에 카테고리 분포 표시
- 질문 유형 분석

#### 3.4 GET /api/dashboard/sources

**목적**: 데이터 소스 기여도 (commit/file/diff)

**설계 결정:**
- **소스 추출**: Q&A 히스토리의 sources 필드에서 타입별 집계
- **응답 형식**: 소스 타입별 기여도 배열

**이유:**
- 바 차트에 소스 기여도 표시
- 어떤 소스가 답변에 더 많이 사용되는지 분석

---

## 구현 세부사항

### 캐싱 전략

**Health Check APIs:**
- **TTL**: 1분
- **이유**: 서비스 상태는 자주 변경되지 않으며, 과도한 DB 호출 방지

**구현:**
```typescript
let supabaseCache: { connected: boolean; timestamp: number } | null = null;
const CACHE_TTL = 1000 * 60; // 1분

if (supabaseCache && (now - supabaseCache.timestamp) < CACHE_TTL) {
    return supabaseCache.connected;
}
```

### 데이터 변환

**History APIs:**
- **snake_case → camelCase**: Supabase 응답을 프론트엔드 타입에 맞게 변환
- **이유**: 프론트엔드 TypeScript 타입 일관성 유지

**구현:**
```typescript
const transformed = {
    id: record.id,
    question: record.question,
    questionSummary: record.question_summary,  // snake_case → camelCase
    responseTimeMs: record.response_time_ms,
    // ...
};
```

### 에러 처리

**일관된 패턴:**
- **500 에러**: 서버 내부 오류
- **404 에러**: 리소스 없음
- **400 에러**: 잘못된 요청
- **기본값 반환**: 통계 API는 실패 시 0 값 반환

**이유:**
- 프론트엔드에서 일관된 에러 처리
- 부분 실패 허용 (통계 API)

---

## 대안 고려

### 대안 1: GraphQL API

**고려사항:**
- 복잡한 쿼리 지원
- 타입 안정성

**거부 이유:**
- REST API로 충분
- GraphQL 인프라 복잡도 증가
- 프론트엔드 요구사항 단순

### 대안 2: 통합 엔드포인트

**고려사항:**
- `/api/dashboard` 하나로 모든 통계 반환

**거부 이유:**
- 각 통계는 독립적으로 사용됨
- 개별 캐싱 전략 적용 가능
- 프론트엔드에서 필요한 데이터만 요청

### 대안 3: WebSocket 실시간 업데이트

**고려사항:**
- 실시간 대시보드 업데이트

**거부 이유:**
- Serverless 환경에서 WebSocket 지원 제한
- 실시간 업데이트 필요성 낮음
- 복잡도 증가

---

## 결과

### 장점

1. **모니터링**: Health check API로 시스템 상태 실시간 확인
2. **사용자 경험**: 히스토리 조회 및 검색 기능
3. **분석**: 대시보드 통계로 시스템 사용 패턴 파악
4. **유지보수**: 명확한 API 구조로 확장 용이

### 단점

1. **DB 부하**: 통계 API는 전체 데이터 조회 (향후 최적화 필요)
2. **캐싱 복잡도**: 서비스별 캐시 관리 필요

### 향후 개선

1. **통계 API 최적화**: 
   - Materialized View 활용
   - 배치 작업으로 사전 계산
   
2. **캐싱 강화**:
   - Redis 캐싱 (선택적)
   - HTTP 캐싱 헤더 추가

3. **API 버전 관리**:
   - `/api/v1/` prefix 추가
   - 하위 호환성 유지

---

## 관련 문서

- [Milestone 3: 서버리스 API 서버](../06_milestones/00_Project_Milestones.md#milestone-3-서버리스-api-서버)
- [시스템 아키텍처](../02_architecture/01_System_Architecture.md)
- [API 엔드포인트 구현](../CLAUDE.md#api-response-types)

