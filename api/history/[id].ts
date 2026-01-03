import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { handleError } from '../_lib/errorHandler.js';
import { getQAHistoryById } from '../../shared/lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID가 필요합니다.' });
    }

    const record = await getQAHistoryById(id);

    if (!record) {
      return res.status(404).json({ error: '이력을 찾을 수 없습니다.' });
    }

    // snake_case를 camelCase로 변환하여 프론트엔드에 전달
    const transformedRecord = {
      id: record.id,
      question: record.question,
      questionSummary: record.question_summary,
      answer: record.answer,
      category: record.category,
      categoryConfidence: record.category_confidence,
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
    };

    res.json(transformedRecord);
  } catch (error) {
    handleError(res, error, 'History record retrieval failed');
  }
}
