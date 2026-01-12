/**
 * Supabase Client
 * 싱글톤 패턴으로 Supabase 클라이언트 관리
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  // Use service role key for write operations (INSERT, UPDATE, DELETE)
  // Falls back to anon key for read-only operations
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY');
  }

  supabaseClient = createClient(url, key);
  return supabaseClient;
}

/**
 * Q&A 히스토리 저장 옵션
 */
export interface SaveQAHistoryOptions {
  sessionId?: string;
  questionSummary?: string;
  category?: string;
  categoryConfidence?: number;
  status?: 'success' | 'partial' | 'failed';
  responseTimeMs?: number;
  classificationTimeMs?: number;
  vectorSearchTimeMs?: number;
  llmGenerationTimeMs?: number;
  dbSaveTimeMs?: number;
  tokenUsage?: number;
  promptTokens?: number;
  completionTokens?: number;
  embeddingTokens?: number;
  llmProvider?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Q&A 히스토리 저장
 */
export async function saveQAHistory(
  question: string,
  answer: string,
  sources: Array<{ id: string; type: string; score: number }>,
  options?: SaveQAHistoryOptions
): Promise<void> {
  console.log('[saveQAHistory] Starting save...');
  const supabase = getSupabaseClient();

  const insertData = {
    question,
    question_summary: options?.questionSummary || question.slice(0, 20),
    answer,
    sources,
    session_id: options?.sessionId || null,
    category: options?.category || 'etc',
    category_confidence: options?.categoryConfidence || null,
    status: options?.status || 'success',
    response_time_ms: options?.responseTimeMs || null,
    classification_time_ms: options?.classificationTimeMs || null,
    vector_search_time_ms: options?.vectorSearchTimeMs || null,
    llm_generation_time_ms: options?.llmGenerationTimeMs || null,
    db_save_time_ms: options?.dbSaveTimeMs || null,
    token_usage: options?.tokenUsage || null,
    prompt_tokens: options?.promptTokens || null,
    completion_tokens: options?.completionTokens || null,
    embedding_tokens: options?.embeddingTokens || null,
    llm_provider: options?.llmProvider || null,
    metadata: options?.metadata || null,
    created_at: new Date().toISOString(),
  };

  console.log('[saveQAHistory] Inserting data...');
  const { error } = await supabase.from('qa_history').insert(insertData);

  if (error) {
    console.error('[saveQAHistory] Failed:', error.message);
  } else {
    console.log('[saveQAHistory] Success!');
  }
}

/**
 * Q&A 히스토리 조회
 */
export async function getQAHistory(
  limit: number = 50,
  sessionId?: string
): Promise<any[]> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('qa_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch Q&A history: ${error.message}`);
  }

  return data || [];
}
