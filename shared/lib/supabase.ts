/**
 * Supabase Client
 * 싱글톤 패턴으로 Supabase 클라이언트 관리
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials: SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  supabaseClient = createClient(url, key);
  return supabaseClient;
}

/**
 * Q&A 히스토리 저장
 */
export async function saveQAHistory(
  question: string,
  answer: string,
  sources: Array<{ id: string; type: string; score: number }>,
  sessionId?: string
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from('qa_history').insert({
    question,
    answer,
    sources,
    session_id: sessionId || null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to save Q&A history:', error.message);
    // Don't throw - this is a non-critical operation
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
