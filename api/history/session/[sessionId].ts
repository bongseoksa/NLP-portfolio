import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../../_lib/cors.js';
import { handleError } from '../../_lib/errorHandler.js';
import { getQAHistoryBySession } from '../../../shared/lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Session ID가 필요합니다.' });
    }

    const records = await getQAHistoryBySession(sessionId);

    // snake_case를 camelCase로 변환
    const transformedRecords = records.map((record: any) => ({
      id: record.id,
      sessionId: record.session_id,
      question: record.question,
      questionSummary: record.question_summary,
      answer: record.answer,
      category: record.category,
      categoryConfidence: record.category_confidence ?? 0,
      sources: record.sources || [],
      status: record.status,

      // 시간 정보
      responseTimeMs: record.response_time_ms || 0,
      classificationTimeMs: record.classification_time_ms,
      vectorSearchTimeMs: record.vector_search_time_ms,
      llmGenerationTimeMs: record.llm_generation_time_ms,
      dbSaveTimeMs: record.db_save_time_ms,

      // 토큰 정보
      tokenUsage: record.token_usage || 0,
      promptTokens: record.prompt_tokens,
      completionTokens: record.completion_tokens,
      embeddingTokens: record.embedding_tokens,

      createdAt: record.created_at,
    }));

    res.json(transformedRecords);
  } catch (error) {
    handleError(res, error, 'Session history retrieval failed');
  }
}
