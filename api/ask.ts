/**
 * Vercel Serverless Function for /api/ask endpoint
 *
 * 이 파일은 Vercel 배포 시 자동으로 `/api/ask` 엔드포인트로 변환됩니다.
 * Express 서버 대신 Vercel의 serverless function으로 작동합니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchVectorsFromFile } from '../src/service/vector-store/fileVectorStore.js';
import { generateQueryEmbedding } from '../src/service/vector-store/embeddingService.js';
import { generateAnswerWithUsage } from '../src/service/qa/answer.js';
import { saveQAHistory } from '../src/service/server/services/supabase.js';
import { classifyQuestionWithConfidence } from '../src/service/qa/classifier.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Serverless Function Handler
 *
 * 제약사항:
 * - 실행 시간: 최대 60초 (Hobby plan) / 300초 (Pro plan)
 * - 메모리: 최대 1024MB
 * - 상태 저장 불가 (stateless)
 * - Cold Start: 첫 요청 시 100-500ms 지연
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-Type'
  );

  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // POST만 허용
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const startTime = Date.now();

  try {
    const { question, sessionId: clientSessionId } = req.body;

    // 세션 ID 생성 또는 사용
    const sessionId = clientSessionId || uuidv4();

    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: '질문을 입력해주세요.' });
      return;
    }

    // Serverless에서는 VECTOR_FILE_URL만 사용 (ChromaDB, Supabase는 사용 불가)
    const vectorFileUrl = process.env.VECTOR_FILE_URL;
    if (!vectorFileUrl) {
      res.status(500).json({
        error: 'Vector file URL not configured',
        message: 'VECTOR_FILE_URL environment variable is required for serverless deployment'
      });
      return;
    }

    console.log(`🔍 Serverless API 질의: "${question}"`);

    // 단계별 시간 측정
    let classificationEndTime = 0;
    let vectorSearchEndTime = 0;
    let llmGenerationEndTime = 0;

    // 1. 질문 분류 (rule-based, 빠름)
    const { category, confidence } = classifyQuestionWithConfidence(question);
    classificationEndTime = Date.now();

    // 2. 쿼리 임베딩 생성 (OpenAI API 호출)
    const queryEmbedding = await generateQueryEmbedding(question);

    // 3. 벡터 검색 (파일 기반, 메모리 캐싱)
    const owner = process.env.TARGET_REPO_OWNER || '';
    const repo = process.env.TARGET_REPO_NAME || 'portfolio';

    const contexts = await searchVectorsFromFile(queryEmbedding, 5, {
      threshold: 0.0,
      filterMetadata: { owner, repo }
    });

    vectorSearchEndTime = Date.now();
    console.log(`   → ${contexts.length}개 문서 검색됨`);

    // 4. LLM 답변 생성 (OpenAI/Claude)
    const { answer, usage } = await generateAnswerWithUsage(question, contexts);
    llmGenerationEndTime = Date.now();

    // 단계별 시간 계산
    const classificationTimeMs = classificationEndTime - startTime;
    const vectorSearchTimeMs = vectorSearchEndTime - classificationEndTime;
    const llmGenerationTimeMs = llmGenerationEndTime - vectorSearchEndTime;
    const responseTimeMs = Date.now() - startTime;

    // 응답 상태 결정
    let status: 'success' | 'partial' | 'failed' = 'success';

    const isErrorAnswer = answer.includes('오류가 발생하여 답변을 생성할 수 없습니다') ||
                          answer.includes('관련 정보를 찾을 수 없습니다') ||
                          answer.includes('답변을 생성할 수 없습니다');

    if (contexts.length === 0 || isErrorAnswer) {
      status = 'failed';
    } else if (contexts.length < 3) {
      status = 'partial';
    }

    // 질문 요약
    const questionSummary = question.length > 27
      ? question.slice(0, 27) + '...'
      : question;

    // 소스 정보 구성
    const sources = contexts.map(ctx => {
      const itemType = ctx.metadata?.type || 'commit';

      if (itemType === 'file') {
        return {
          type: 'code' as const,
          filePath: ctx.metadata?.path || ctx.metadata?.filePath || '',
          commitHash: ctx.metadata?.sha || ctx.metadata?.commitId || '',
          commitMessage: '',
          relevanceScore: ctx.score || 0,
        };
      } else if (itemType === 'diff') {
        return {
          type: 'history' as const,
          filePath: ctx.metadata?.filePath || '',
          commitHash: ctx.metadata?.commitId || ctx.metadata?.sha || '',
          commitMessage: '',
          relevanceScore: ctx.score || 0,
        };
      } else {
        let affectedFiles: string[] = [];
        if (ctx.metadata?.affectedFiles) {
          try {
            if (typeof ctx.metadata.affectedFiles === 'string') {
              affectedFiles = JSON.parse(ctx.metadata.affectedFiles);
            } else if (Array.isArray(ctx.metadata.affectedFiles)) {
              affectedFiles = ctx.metadata.affectedFiles;
            }
          } catch (e) {
            console.warn('⚠️ affectedFiles 파싱 실패:', e);
          }
        }

        return {
          type: 'commit' as const,
          commitHash: ctx.metadata?.sha || '',
          commitMessage: ctx.metadata?.message || '',
          filePath: affectedFiles[0] || ctx.metadata?.filePath || '',
          relevanceScore: ctx.score || 0,
        };
      }
    });

    // 5. Supabase에 이력 저장 (비동기, non-blocking)
    const dbSaveStartTime = Date.now();
    try {
      await saveQAHistory({
        session_id: sessionId,
        question,
        question_summary: questionSummary,
        answer,
        category,
        category_confidence: confidence,
        sources,
        status,
        response_time_ms: responseTimeMs,
        classification_time_ms: classificationTimeMs,
        vector_search_time_ms: vectorSearchTimeMs,
        llm_generation_time_ms: llmGenerationTimeMs,
        db_save_time_ms: 0,
        token_usage: usage.totalTokens,
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        embedding_tokens: 0,
      });
    } catch (dbError: any) {
      console.warn('⚠️ Supabase 저장 실패:', dbError.message);
    }
    const dbSaveTimeMs = Date.now() - dbSaveStartTime;

    console.log(`✅ Serverless 응답 생성 완료 (${responseTimeMs}ms)`);
    console.log(`   📊 단계별: 분류=${classificationTimeMs}ms, 검색=${vectorSearchTimeMs}ms, LLM=${llmGenerationTimeMs}ms, DB=${dbSaveTimeMs}ms`);

    // 6. 클라이언트 응답
    res.status(200).json({
      answer,
      sources,
      category,
      categoryConfidence: confidence,
      status,
      responseTimeMs,
      tokenUsage: usage.totalTokens,
      sessionId,

      timings: {
        classification: classificationTimeMs,
        vectorSearch: vectorSearchTimeMs,
        llmGeneration: llmGenerationTimeMs,
        dbSave: dbSaveTimeMs,
        total: responseTimeMs,
      },

      tokens: {
        prompt: usage.promptTokens,
        completion: usage.completionTokens,
        embedding: 0,
        total: usage.totalTokens,
      },
    });

  } catch (error: any) {
    console.error('❌ Serverless 오류:', error.message);

    // 타임아웃 에러 감지
    const isTimeout = error.message?.includes('timeout') ||
                     error.code === 'FUNCTION_INVOCATION_TIMEOUT';

    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'Request timeout' : '답변 생성 중 오류가 발생했습니다.',
      message: error.message,
    });
  }
}
