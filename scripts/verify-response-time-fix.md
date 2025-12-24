# 최근 응답 속도 수정 완료

## 문제 분석 결과

1. **원인**: 백엔드 API가 데이터베이스의 `snake_case` 형식(`response_time_ms`)을 그대로 반환하고 있었습니다.
2. **해결**: 백엔드 라우터에서 `camelCase` 형식(`responseTimeMs`)으로 변환하도록 수정했습니다.

## 수정 사항

### 1. 백엔드 수정 (`src/server/routes/history.ts`)
- `GET /api/history` 엔드포인트에서 `snake_case` → `camelCase` 변환 추가
- `GET /api/history/:id` 엔드포인트에서도 동일한 변환 추가

### 2. 프론트엔드 수정 (`frontend/src/pages/DashboardPage.tsx`)
- `responseTimeMs`와 `response_time_ms` 둘 다 지원하도록 fallback 추가
- 서버 재시작 전에도 정상 작동

## 서버 재시작 필요

변경사항을 적용하려면 **API 서버를 재시작**해야 합니다:

```bash
# 서버 재시작 방법
# 1. 현재 실행 중인 서버 종료 (Ctrl+C)
# 2. 서버 재시작
pnpm run server

# 또는 Control 서버와 함께 시작
pnpm run start:local
```

## 테스트 방법

서버 재시작 후 다음 명령어로 테스트:

```bash
# 최종 테스트
npx tsx scripts/test-response-time-final.ts

# 또는 직접 API 호출
curl 'http://localhost:3001/api/history?limit=1' | jq '.[0] | {responseTimeMs, response_time_ms}'
```

예상 결과:
- `responseTimeMs`: 숫자 값 (예: 14208)
- `response_time_ms`: 없어야 함 (또는 있어도 무방)

## 프론트엔드 확인

대시보드 페이지에서 "최근 응답 속도" 섹션이 정상적으로 표시되는지 확인:
- 각 질문 옆에 밀리초 단위로 응답 시간이 표시되어야 함
- 색상: 2초 미만(초록), 2-5초(노랑), 5초 이상(빨강)
