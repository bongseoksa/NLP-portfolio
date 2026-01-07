# RLS Policy Fix for Embeddings Table

## 문제
- Row-Level Security (RLS) 정책이 활성화되어 있어 `SUPABASE_ANON_KEY`로 데이터 삽입 불가
- 임베딩 파이프라인 실행 시 "violates row-level security policy" 오류 발생

## 해결 방법

### Supabase Dashboard에서 SQL 실행

1. **Supabase Dashboard 접속**
   - https://supabase.com/dashboard
   - 프로젝트 선택 (nlp-portfolio)

2. **SQL Editor 열기**
   - 왼쪽 메뉴에서 "SQL Editor" 클릭
   - "New query" 버튼 클릭

3. **아래 SQL 복사하여 실행**

```sql
-- Option 1: RLS 완전히 비활성화 (개발 환경 권장)
ALTER TABLE embeddings DISABLE ROW LEVEL SECURITY;

-- Option 2: RLS 활성화하되 모든 작업 허용 (프로덕션 권장)
-- ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
--
-- -- 모든 사용자의 SELECT 허용
-- CREATE POLICY "Allow public SELECT on embeddings"
-- ON embeddings FOR SELECT
-- USING (true);
--
-- -- 모든 사용자의 INSERT 허용
-- CREATE POLICY "Allow public INSERT on embeddings"
-- ON embeddings FOR INSERT
-- WITH CHECK (true);
--
-- -- 모든 사용자의 UPDATE 허용
-- CREATE POLICY "Allow public UPDATE on embeddings"
-- ON embeddings FOR UPDATE
-- USING (true)
-- WITH CHECK (true);
--
-- -- 모든 사용자의 DELETE 허용
-- CREATE POLICY "Allow public DELETE on embeddings"
-- ON embeddings FOR DELETE
-- USING (true);
```

4. **Run 버튼 클릭**

5. **성공 확인**
   - "Success. No rows returned" 메시지 확인

## 마이그레이션 후 작업

RLS 설정 완료 후 임베딩 파이프라인을 다시 실행하세요:

```bash
pnpm run embed:reset
```

## 검증

임베딩 저장이 성공했는지 확인:

```bash
pnpm test:supabase
```

예상 출력:
```
✅ Embeddings count: 172
```

## 보안 참고사항

**개발 환경**:
- Option 1 (RLS 비활성화) 사용 권장
- 빠르고 간단한 개발 가능

**프로덕션 환경**:
- Option 2 (RLS + 정책) 사용 권장
- 더 세밀한 접근 제어 가능
- 필요시 정책을 수정하여 특정 사용자만 INSERT 가능하도록 제한 가능
