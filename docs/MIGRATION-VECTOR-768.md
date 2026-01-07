# Vector Dimension Migration Guide

## 문제
- Gemini API는 768 차원 벡터를 생성
- 현재 Supabase embeddings 테이블은 384 차원으로 설정됨
- 차원 불일치로 인해 벡터 저장 실패

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
-- Step 1: 기존 embedding 컬럼 삭제
ALTER TABLE embeddings DROP COLUMN IF EXISTS embedding;

-- Step 2: 768 차원 벡터 컬럼 추가
ALTER TABLE embeddings ADD COLUMN embedding vector(768);

-- Step 3: 인덱스 재생성
DROP INDEX IF EXISTS embeddings_embedding_idx;
CREATE INDEX embeddings_embedding_idx
  ON embeddings
  USING hnsw (embedding vector_cosine_ops);
```

4. **Run 버튼 클릭**

5. **성공 확인**
   - "Success. No rows returned" 메시지 확인

## 마이그레이션 후 작업

마이그레이션 완료 후 임베딩 파이프라인을 다시 실행하세요:

```bash
npx tsx scripts/unified-embedding-pipeline.ts --reset
```

또는

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
