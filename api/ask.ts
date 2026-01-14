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
import { classifyQuestion } from '../shared/services/qa/classifier.js';
import { saveQAHistory } from '../shared/lib/supabase.js';
import type { QAResponse, QARequest } from '../shared/models/SearchResult.js';
import { encoding_for_model } from 'tiktoken';

// Token counter using tiktoken
let tokenEncoder: ReturnType<typeof encoding_for_model> | null = null;

function getTokenEncoder() {
  if (!tokenEncoder) {
    tokenEncoder = encoding_for_model('gpt-4o');
  }
  return tokenEncoder;
}

function countTokens(text: string): number {
  try {
    const encoder = getTokenEncoder();
    return encoder.encode(text).length;
  } catch {
    // Fallback: rough estimate (1 token ≈ 4 characters for English, 2 for Korean)
    return Math.ceil(text.length / 3);
  }
}

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
  const timings = {
    classification: 0,
    embedding: 0,
    vectorSearch: 0,
    llmGeneration: 0,
    dbSave: 0,
  };

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

    // Step 1: Classify question
    console.log('[Q&A] Step 1: Classifying question...');
    const classificationStart = Date.now();
    const { category, confidence: categoryConfidence } = classifyQuestion(question);
    timings.classification = Date.now() - classificationStart;
    console.log(`[Q&A] Category: ${category} (confidence: ${categoryConfidence})`);

    // Step 2: Generate query embedding
    console.log('[Q&A] Step 2: Generating query embedding...');
    const embeddingStart = Date.now();
    const queryEmbedding = await generateQueryEmbedding(question);
    timings.embedding = Date.now() - embeddingStart;

    // Step 3: Search similar vectors
    console.log('[Q&A] Step 3: Searching similar vectors...');
    const vectorSearchStart = Date.now();
    const sources = await searchSimilar(queryEmbedding, topK);
    timings.vectorSearch = Date.now() - vectorSearchStart;

    if (sources.length === 0) {
      const processingTime = Date.now() - startTime;

      // Save failed attempt
      saveQAHistory(
        question,
        '관련 정보를 찾지 못했습니다.',
        [],
        {
          sessionId,
          category,
          categoryConfidence,
          status: 'partial',
          responseTimeMs: processingTime,
          classificationTimeMs: timings.classification,
          vectorSearchTimeMs: timings.vectorSearch,
        }
      ).catch((err) => console.error('[Q&A] Failed to save history:', err));

      const response: QAResponse = {
        answer: '관련 정보를 찾지 못했습니다. 다른 방식으로 질문해 주세요.',
        sources: [],
        processingTime,
        status: 'partial',
      };
      res.status(200).json(response);
      return;
    }

    // Step 4: Generate answer with LLM
    console.log('[Q&A] Step 4: Generating answer with LLM...');
    const llmStart = Date.now();
    const answer = await generateAnswer(question, sources);
    timings.llmGeneration = Date.now() - llmStart;

    const processingTime = Date.now() - startTime;

    // Calculate token usage
    const contextText = sources.map((s) => s.content).join('\n');
    const promptTokens = countTokens(question + contextText);
    const completionTokens = countTokens(answer);
    const embeddingTokens = countTokens(question);
    const totalTokens = promptTokens + completionTokens;

    // Step 5: Save to Q&A history (await to ensure completion before response)
    console.log('[Q&A] Step 5: Saving to history...');
    const dbSaveStart = Date.now();
    try {
      await saveQAHistory(
        question,
        answer,
        sources.map((s) => ({ id: s.id, type: s.type, score: s.score })),
        {
          sessionId,
          questionSummary: question.slice(0, 20),
          category,
          categoryConfidence,
          status: 'success',
          responseTimeMs: processingTime,
          classificationTimeMs: timings.classification,
          vectorSearchTimeMs: timings.vectorSearch,
          llmGenerationTimeMs: timings.llmGeneration,
          llmProvider: getLLMProvider(),
          tokenUsage: totalTokens,
          promptTokens,
          completionTokens,
          embeddingTokens,
        }
      );
      timings.dbSave = Date.now() - dbSaveStart;
    } catch (err) {
      console.error('[Q&A] Failed to save history:', err);
    }

    console.log(`[Q&A] Completed in ${processingTime}ms (dbSave: ${timings.dbSave}ms)`);

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

/**
 * 사용 중인 LLM 프로바이더 반환
 */
function getLLMProvider(): string {
  if (process.env.CLAUDE_API_KEY) return 'claude';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'unknown';
}
