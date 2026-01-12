/**
 * Q&A History Endpoint
 * GET /api/history
 *
 * Q&A 히스토리 조회
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { getSupabaseClient } from '../../shared/lib/supabase.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    handleOptionsRequest(res);
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseClient();

    const limit = parseInt(req.query.limit as string) || 50;
    const sessionId = req.query.sessionId as string | undefined;

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
      throw new Error(`Database error: ${error.message}`);
    }

    // Transform snake_case to camelCase for frontend
    const records = (data || []).map((record) => ({
      id: record.id,
      sessionId: record.session_id,
      question: record.question,
      questionSummary: record.question_summary,
      answer: record.answer,
      category: record.category,
      categoryConfidence: record.category_confidence,
      sources: record.sources,
      status: record.status,
      responseTimeMs: record.response_time_ms,
      classificationTimeMs: record.classification_time_ms,
      vectorSearchTimeMs: record.vector_search_time_ms,
      llmGenerationTimeMs: record.llm_generation_time_ms,
      dbSaveTimeMs: record.db_save_time_ms,
      tokenUsage: record.token_usage,
      promptTokens: record.prompt_tokens,
      completionTokens: record.completion_tokens,
      embeddingTokens: record.embedding_tokens,
      llmProvider: record.llm_provider,
      metadata: record.metadata,
      createdAt: record.created_at,
    }));

    res.status(200).json(records);
  } catch (error) {
    console.error('[History] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch history',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
