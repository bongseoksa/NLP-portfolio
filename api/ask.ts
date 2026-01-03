/**
 * Vercel Serverless Function for /api/ask endpoint
 *
 * 이 파일은 Vercel 배포 시 자동으로 `/api/ask` 엔드포인트로 변환됩니다.
 * Express 서버 대신 Vercel의 serverless function으로 작동합니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchVectorsFromFile } from '../shared/services/vector-store/fileVectorStore.js';
import { generateQueryEmbedding } from '../shared/services/vector-store/embeddingService.js';
import { generateAnswerWithUsage } from '../shared/services/qa/answer.js';
import { saveQAHistory } from '../shared/lib/supabase.js';
import { classifyQuestionWithConfidence } from '../shared/services/qa/classifier.js';
import { addQAHistoryToVectors } from '../shared/services/vector-store/qaHistoryVectorStore.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Serverless Function Handler
 *
 * 제약사항:
 * - 실행 시간: 최대 60초 (Hobby plan) / 300초 (Pro plan)
 * - 메모리: 최대 1024MB
 * - 상태 저장 불가 (stateless)
 * - Cold Start: 첫 요청 시 100-500ms 지연
 * 
 * 처리 흐름:
 * 1. 요청 파싱 및 검증
 * 2. 질문 분류
 * 3. 쿼리 임베딩 생성
 * 4. 벡터 검색 (코드 + 히스토리)
 * 5. Context 구성
 * 6. LLM 답변 생성
 * 7. 응답 반환
 * 8. 히스토리 저장 (비동기)
 */

// 타임아웃 설정 (안전 마진 포함)
const TIMEOUT_MS = 50000; // 50초 (Hobby plan 기준 60초에서 10초 여유)

/**
 * 남은 시간 체크
 */
function checkTimeRemaining(startTime: number, maxTime: number = TIMEOUT_MS): number {
  const elapsed = Date.now() - startTime;
  const remaining = maxTime - elapsed;
  
  if (remaining < 5000) {
    console.warn(`⚠️ 시간 부족: ${remaining}ms 남음`);
  }
  
  return remaining;
}

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

    // 벡터 파일 URL 확인 (로컬 개발 시 기본값 사용)
    const vectorFileUrl = process.env.VECTOR_FILE_URL || 'output/embeddings.json.gz';
    
    // 벡터 파일이 없으면 에러 (파일 존재 여부는 fileVectorStore에서 확인)
    if (!vectorFileUrl) {
      res.status(500).json({
        error: 'Vector file not configured',
        message: 'VECTOR_FILE_URL environment variable is required, or ensure output/embeddings.json.gz exists',
        status: 'failed'
      });
      return;
    }

    console.log(`🔍 Serverless API 질의: "${question}"`);

    // 단계별 시간 측정
    let classificationEndTime = 0;
    let embeddingEndTime = 0;
    let vectorSearchEndTime = 0;
    let llmGenerationEndTime = 0;

    // 시간 체크 (타임아웃 방지)
    checkTimeRemaining(startTime);

    // [1] 질문 분류 (rule-based, 빠름)
    const classificationStart = Date.now();
    const { category, confidence } = classifyQuestionWithConfidence(question);
    classificationEndTime = Date.now();
    const classificationTimeMs = classificationEndTime - classificationStart;
    console.log(`   [1] 질문 분류 완료: ${classificationTimeMs}ms (카테고리: ${category})`);

    // 시간 체크
    const remainingAfterClassification = checkTimeRemaining(startTime);
    if (remainingAfterClassification < 10000) {
      console.warn(`⚠️ 시간 부족으로 인해 간소화된 처리로 전환`);
    }

    // [2] 쿼리 임베딩 생성 (OpenAI API 호출)
    const embeddingStart = Date.now();
    const queryEmbedding = await generateQueryEmbedding(question);
    embeddingEndTime = Date.now();
    const embeddingTimeMs = embeddingEndTime - embeddingStart;
    console.log(`   [2] 임베딩 생성 완료: ${embeddingTimeMs}ms`);

    // 시간 체크
    checkTimeRemaining(startTime);

    // [3] 벡터 검색 (파일 기반, 메모리 캐싱)
    const owner = process.env.TARGET_REPO_OWNER || '';
    const repo = process.env.TARGET_REPO_NAME || 'portfolio';

    const searchStart = Date.now();
    let contexts;
    try {
      contexts = await searchVectorsFromFile(queryEmbedding, 5, {
        threshold: 0.0,
        filterMetadata: { owner, repo },
        includeHistory: true,
        historyWeight: 0.3,
        category  // 카테고리 기반 검색 모드
      });
    } catch (searchError: any) {
      console.error('❌ 벡터 검색 실패:', searchError.message);
      // 벡터 파일이 없거나 로드 실패 시
      if (searchError.message?.includes('Failed to load') || searchError.message?.includes('not found')) {
        return res.status(500).json({
          error: 'Vector file not found',
          message: '임베딩 파일을 찾을 수 없습니다. VECTOR_FILE_URL을 확인하거나 output/embeddings.json.gz 파일이 존재하는지 확인해주세요.',
          status: 'failed'
        });
      }
      throw searchError;
    }
    vectorSearchEndTime = Date.now();
    const vectorSearchTimeMs = vectorSearchEndTime - searchStart;
    console.log(`   [3] 벡터 검색 완료: ${vectorSearchTimeMs}ms (${contexts.length}개 문서)`);

    // 시간 체크
    checkTimeRemaining(startTime);

    // [4] LLM 답변 생성 (OpenAI/Claude)
    const llmStart = Date.now();
    const { answer, usage } = await generateAnswerWithUsage(question, contexts);
    llmGenerationEndTime = Date.now();
    const llmGenerationTimeMs = llmGenerationEndTime - llmStart;
    console.log(`   [4] LLM 답변 생성 완료: ${llmGenerationTimeMs}ms`);

    // 단계별 시간 계산
    const responseTimeMs = Date.now() - startTime;
    
    // 최종 시간 체크
    const finalRemaining = checkTimeRemaining(startTime);
    if (finalRemaining < 0) {
      console.error(`❌ 타임아웃 위험: ${Math.abs(finalRemaining)}ms 초과`);
    }

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

    // [5] 비동기 작업 시작 (Non-blocking - 응답 후 처리)
    // 히스토리 저장은 Promise.all로 묶어서 병렬 처리
    // 실패해도 API 응답은 정상적으로 반환
    const asyncStartTime = Date.now();
    
    Promise.all([
      // Supabase에 이력 저장
      saveQAHistory({
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
      }).catch((dbError: any) => {
        console.warn('⚠️ Supabase 저장 실패:', dbError.message);
      }),
      
      // 히스토리 벡터 추가
      addQAHistoryToVectors({
        sessionId,
        question,
        answer,
        category,
        categoryConfidence: confidence,
        sources: sources.map(s => s.commitHash || s.filePath || ''),
        status,
        responseTimeMs,
        tokenUsage: usage.totalTokens,
        owner,
        repo
      }).catch((historyError: any) => {
        console.warn('⚠️ History vector 추가 실패:', historyError.message);
      })
    ]).catch((error: any) => {
      console.warn('⚠️ 비동기 작업 실패:', error.message);
      // 전체 실패해도 무시 (응답은 이미 반환됨)
    });
    
    const asyncTimeMs = Date.now() - asyncStartTime;

    console.log(`✅ Serverless 응답 생성 완료 (${responseTimeMs}ms)`);
    console.log(`   📊 단계별 시간:`);
    console.log(`      - 분류: ${classificationTimeMs}ms`);
    console.log(`      - 임베딩: ${embeddingTimeMs}ms`);
    console.log(`      - 검색: ${vectorSearchTimeMs}ms`);
    console.log(`      - LLM: ${llmGenerationTimeMs}ms`);
    console.log(`      - 비동기 작업 시작: ${asyncTimeMs}ms`);
    console.log(`      - 총 시간: ${responseTimeMs}ms`);

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
        embedding: embeddingTimeMs,
        vectorSearch: vectorSearchTimeMs,
        llmGeneration: llmGenerationTimeMs,
        asyncStart: asyncTimeMs,
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
    const errorTime = Date.now() - startTime;
    console.error(`❌ Serverless 오류 (${errorTime}ms):`, error.message);
    
    if (error.stack) {
      console.error('스택 트레이스:', error.stack);
    }

    // 타임아웃 에러 감지
    const isTimeout = error.message?.includes('timeout') ||
                     error.message?.includes('Timeout') ||
                     error.code === 'FUNCTION_INVOCATION_TIMEOUT' ||
                     error.code === 'ETIMEDOUT';

    // 타임아웃이거나 시간 초과 시
    if (isTimeout || errorTime >= TIMEOUT_MS) {
      return res.status(504).json({
        error: 'Request timeout',
        message: '요청 처리 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.',
        elapsedTime: errorTime
      });
    }

    // 기타 에러
    return res.status(500).json({
      error: '답변 생성 중 오류가 발생했습니다.',
      message: error.message,
      elapsedTime: errorTime
    });
  }
}
