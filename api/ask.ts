/**
 * Q&A Endpoint
 * POST /api/ask
 *
 * 질문을 받아 벡터 검색 후 LLM으로 답변 생성
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from './_lib/cors.js';
import { handleError } from './_lib/errorHandler.js';
import { generateQueryEmbedding } from '../shared/services/vector-store/embeddingService.js';
import { searchSimilar } from '../shared/services/vector-store/fileVectorStore.js';
import { generateAnswer } from '../shared/services/qa/answer.js';
import { saveQAHistory } from '../shared/lib/supabase.js';
import type { QAResponse, QARequest } from '../shared/models/SearchResult.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    handleOptionsRequest(res);
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const startTime = Date.now();

  try {
    const { question, sessionId, topK = 5 } = req.body as QARequest;

    // Validate input
    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: 'Question is required' });
      return;
    }

    if (question.trim().length === 0) {
      res.status(400).json({ error: 'Question cannot be empty' });
      return;
    }

    console.log(`[Q&A] Processing question: "${question.substring(0, 50)}..."`);

    // Step 1: Generate query embedding
    console.log('[Q&A] Step 1: Generating query embedding...');
    const queryEmbedding = await generateQueryEmbedding(question);

    // Step 2: Search similar vectors
    console.log('[Q&A] Step 2: Searching similar vectors...');
    const sources = await searchSimilar(queryEmbedding, topK);

    if (sources.length === 0) {
      const response: QAResponse = {
        answer: '관련 정보를 찾지 못했습니다. 다른 방식으로 질문해 주세요.',
        sources: [],
        processingTime: Date.now() - startTime,
        status: 'partial',
      };
      res.status(200).json(response);
      return;
    }

    // Step 3: Generate answer with LLM
    console.log('[Q&A] Step 3: Generating answer with LLM...');
    const answer = await generateAnswer(question, sources);

    // Step 4: Save to Q&A history (non-blocking)
    console.log('[Q&A] Step 4: Saving to history...');
    saveQAHistory(
      question,
      answer,
      sources.map((s) => ({ id: s.id, type: s.type, score: s.score })),
      sessionId
    ).catch((err) => console.error('[Q&A] Failed to save history:', err));

    const processingTime = Date.now() - startTime;
    console.log(`[Q&A] Completed in ${processingTime}ms`);

    const response: QAResponse = {
      answer,
      sources,
      processingTime,
      status: 'success',
    };

    res.status(200).json(response);
  } catch (error) {
    handleError(res, error, 'Failed to process question');
  }
}
