# Supabase 마이그레이션 가이드

## 현재 상태

- **문제**: 기존 6개 카테고리 → 12개 카테고리로 확장되었으나, 데이터베이스 스키마는 구버전 상태
- **증상**: 새로운 질문 저장 시 `CHECK constraint violation` 오류 발생
- **해결**: 001_update_category_enum.sql 마이그레이션 실행 필요

## 마이그레이션 실행 방법

### 1. Supabase Dashboard 접속

1. [Supabase Dashboard](https://supabase.com/dashboard) 접속
2. 프로젝트 선택: `vorbpbnvhdakgzpftkfl`
3. 왼쪽 메뉴에서 **SQL Editor** 클릭

### 2. 마이그레이션 SQL 실행

1. `001_update_category_enum.sql` 파일 열기
2. 전체 내용 복사 (Cmd+A, Cmd+C)
3. SQL Editor에 붙여넣기
4. **Run** 버튼 클릭

### 3. 실행 결과 확인

성공 메시지가 표시되면 완료됩니다:
```
Success. No rows returned
```

## 마이그레이션 내용

### 변경 사항

**기존 카테고리 (6개):**
- `planning`, `technical`, `history`, `cs`, `status`, `unknown`

**새로운 카테고리 (12개):**
- `issue` (버그, 오류)
- `implementation` (구현 방법)
- `structure` (프로젝트 구조)
- `history` (커밋 히스토리)
- `data` (데이터 처리)
- `planning` (계획, 로드맵)
- `status` (상태, 진행)
- `techStack` (기술 스택)
- `cs` (컴퓨터 과학)
- `testing` (테스트)
- `summary` (요약)
- `etc` (기타)

### 데이터 마이그레이션

**16개 기존 질문 재분류:**
- `etc`: 9개 (56.3%)
- `techStack`: 3개 (18.8%)
- `testing`: 3개 (18.8%)
- `implementation`: 1개 (6.3%)

재분류는 새로운 분류기(`src/qa/classifier.ts`)의 패턴 매칭 로직을 사용하여 자동 생성되었습니다.

## 검증

마이그레이션 후 다음 쿼리로 결과를 확인하세요:

```sql
-- 카테고리 분포 확인
SELECT category, COUNT(*) as count
FROM qa_history
GROUP BY category
ORDER BY count DESC;

-- 제약 조건 확인
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'qa_history'::regclass
  AND conname = 'qa_history_category_check';
```

## 트러블슈팅

### 오류: "check constraint is violated by some row"

**원인**: Step 순서가 잘못되었거나, 알 수 없는 카테고리 값이 존재

**해결**: 마이그레이션 SQL은 다음 순서로 실행됩니다:
1. 기존 제약 조건 삭제
2. 데이터 재분류 (먼저 실행!)
3. 새로운 제약 조건 추가

### 오류: "permission denied"

**원인**: ANON_KEY로는 DDL 명령어 실행 불가

**해결**: Supabase SQL Editor를 사용하세요 (자동으로 적절한 권한 사용)

## 향후 카테고리 추가 시

1. `src/qa/classifier.ts`에 새로운 카테고리 패턴 추가
2. `src/server/services/supabase.ts`의 타입 정의 업데이트
3. `src/server/services/supabaseMigration.ts`의 스키마 업데이트
4. 새로운 마이그레이션 파일 생성 (002_xxx.sql)
5. Supabase SQL Editor에서 실행

## 관련 파일

- **마이그레이션**: `supabase/migrations/001_update_category_enum.sql`
- **분류기**: `src/qa/classifier.ts`
- **타입 정의**: `src/server/services/supabase.ts`
- **스키마**: `src/server/services/supabaseMigration.ts`
- **분석 스크립트**: `scripts/analyze-categories.ts`
- **재분류 스크립트**: `scripts/reclassify-categories.ts`
