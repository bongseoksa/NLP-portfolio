-- 단계별 시간 필드 추가
ALTER TABLE qa_history ADD COLUMN IF NOT EXISTS classification_time_ms INTEGER DEFAULT 0;
ALTER TABLE qa_history ADD COLUMN IF NOT EXISTS vector_search_time_ms INTEGER DEFAULT 0;
ALTER TABLE qa_history ADD COLUMN IF NOT EXISTS llm_generation_time_ms INTEGER DEFAULT 0;
ALTER TABLE qa_history ADD COLUMN IF NOT EXISTS db_save_time_ms INTEGER DEFAULT 0;

-- 토큰 사용량 필드 (prompt_tokens, completion_tokens, embedding_tokens 추가)
-- token_usage는 이미 존재하므로 총 토큰 수로 사용
ALTER TABLE qa_history ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0;
ALTER TABLE qa_history ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;
ALTER TABLE qa_history ADD COLUMN IF NOT EXISTS embedding_tokens INTEGER DEFAULT 0;

-- 인덱스 추가 (성능 분석용)
CREATE INDEX IF NOT EXISTS idx_qa_history_llm_time ON qa_history(llm_generation_time_ms DESC);
CREATE INDEX IF NOT EXISTS idx_qa_history_total_time ON qa_history(response_time_ms DESC);

-- 확인용 코멘트
COMMENT ON COLUMN qa_history.classification_time_ms IS '질문 분류 단계 처리 시간 (ms)';
COMMENT ON COLUMN qa_history.vector_search_time_ms IS '벡터 검색 단계 처리 시간 (ms)';
COMMENT ON COLUMN qa_history.llm_generation_time_ms IS 'LLM 응답 생성 단계 처리 시간 (ms)';
COMMENT ON COLUMN qa_history.db_save_time_ms IS 'DB 저장 단계 처리 시간 (ms)';
COMMENT ON COLUMN qa_history.prompt_tokens IS '입력 토큰 수 (Prompt)';
COMMENT ON COLUMN qa_history.completion_tokens IS '출력 토큰 수 (Completion)';
COMMENT ON COLUMN qa_history.embedding_tokens IS '임베딩 토큰 수';
