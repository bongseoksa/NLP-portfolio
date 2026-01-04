import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from '../_lib/cors.js';
import { handleError } from '../_lib/errorHandler.js';
import { getQAHistory } from '../../shared/lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { search, category, limit, offset } = req.query;

    const history = await getQAHistory({
      search: search as string,
      category: category as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    // snake_case를 camelCase로 변환하여 프론트엔드에 전달
    const transformedHistory = history.map((record: any) => {
      // 명시적으로 snake_case 필드를 우선 사용
      const responseTime = typeof record.response_time_ms === 'number'
        ? record.response_time_ms
        : (typeof record.responseTimeMs === 'number' ? record.responseTimeMs : 0);

      return {
        id: record.id,
        question: record.question,
        questionSummary: record.question_summary || record.questionSummary || '',
        answer: record.answer,
        category: record.category,
        categoryConfidence: record.category_confidence ?? record.categoryConfidence ?? 0,
        sources: record.sources || [],
        status: record.status,

        // 시간 정보
        responseTimeMs: responseTime,
        classificationTimeMs: record.classification_time_ms,
        vectorSearchTimeMs: record.vector_search_time_ms,
        llmGenerationTimeMs: record.llm_generation_time_ms,
        dbSaveTimeMs: record.db_save_time_ms,

        // 토큰 정보
        tokenUsage: typeof record.token_usage === 'number'
          ? record.token_usage
          : (typeof record.tokenUsage === 'number' ? record.tokenUsage : 0),
        promptTokens: record.prompt_tokens,
        completionTokens: record.completion_tokens,
        embeddingTokens: record.embedding_tokens,

        createdAt: record.created_at || record.createdAt || '',
      };
    });

    res.json(transformedHistory);
  } catch (error) {
    handleError(res, error, 'History retrieval failed');
  }
}
