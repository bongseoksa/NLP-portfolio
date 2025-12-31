/**
 * 질의응답 라우터
 */
import { Router, type Request, type Response, type IRouter } from 'express';
import { searchVectors } from '../../vector-store/searchVectors.js';
import { searchVectorsSupabase } from '../../vector-store/searchVectorsSupabase.js';
import { generateAnswer, generateAnswerWithUsage } from '../../qa/answer.js';
import { saveQAHistory } from '../services/supabase.js';
import { classifyQuestionWithConfidence } from '../../qa/classifier.js';
import { v4 as uuidv4 } from 'uuid';

const router: IRouter = Router();

/**
 * POST /api/ask
 * 질문을 받아 답변 생성
 */
router.post('/', async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    // 요청 본문 로깅 (디버깅용)
    console.log('📥 요청 본문:', JSON.stringify(req.body));
    console.log('📥 Content-Type:', req.headers['content-type']);

    const { question, sessionId: clientSessionId } = req.body;

    // 세션 ID 생성 또는 사용
    const sessionId = clientSessionId || uuidv4();

    if (!question || typeof question !== 'string') {
        console.error('❌ 잘못된 요청: question이 없거나 문자열이 아님');
        res.status(400).json({ error: '질문을 입력해주세요.' });
        return;
    }

    try {
        // Supabase 사용 여부 결정
        const useSupabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) ? true : false;

        // 단계별 시간 측정을 위한 변수
        let classificationEndTime = 0;
        let vectorSearchEndTime = 0;
        let llmGenerationEndTime = 0;

        // 1. 질문 분류 (LLM 호출 이전, rule-based)
        const { category, confidence } = classifyQuestionWithConfidence(question);
        classificationEndTime = Date.now();
        console.log(`📂 질문 분류: ${category} (신뢰도: ${confidence})`);

        let contexts;
        let collectionName = '';

        if (useSupabase) {
            // Supabase Vector Store 검색
            console.log(`🔍 API 질의: "${question}" (Supabase Vector Store)`);

            const owner = process.env.TARGET_REPO_OWNER || '';
            const repo = process.env.TARGET_REPO_NAME || 'portfolio';

            contexts = await searchVectorsSupabase(question, 5, {
                threshold: 0.0,
                filterMetadata: { owner, repo }
            });

            collectionName = `${owner}/${repo}`;
        } else {
            // ChromaDB 검색 (기존 로직)
            const repoName = process.env.TARGET_REPO_NAME || 'portfolio';
            collectionName = `${repoName}-vectors`;

            console.log(`🔍 API 질의: "${question}" (ChromaDB)`);
            contexts = await searchVectors(collectionName, question, 5);

            // 기존 컬렉션 이름으로 fallback
            if (contexts.length === 0) {
                console.log(`   → ${collectionName} 컬렉션이 없어 기존 컬렉션 시도 중...`);
                collectionName = `${repoName}-commits`;
                contexts = await searchVectors(collectionName, question, 5);
            }
        }

        vectorSearchEndTime = Date.now();

        // 2. 벡터 검색 (위에서 이미 수행됨)
        console.log(`   → ${contexts.length}개 문서 검색됨 (저장소: ${collectionName})`);

        // 3. 답변 생성 (토큰 사용량 포함)
        const { answer, usage } = await generateAnswerWithUsage(question, contexts);
        llmGenerationEndTime = Date.now();

        // 단계별 시간 계산
        const classificationTimeMs = classificationEndTime - startTime;
        const vectorSearchTimeMs = vectorSearchEndTime - classificationEndTime;
        const llmGenerationTimeMs = llmGenerationEndTime - vectorSearchEndTime;
        const responseTimeMs = Date.now() - startTime;

        // 응답 상태 결정
        let status: 'success' | 'partial' | 'failed' = 'success';
        
        // 답변 생성 실패 확인 (에러 메시지인 경우)
        const isErrorAnswer = answer.includes('오류가 발생하여 답변을 생성할 수 없습니다') ||
                              answer.includes('관련 정보를 찾을 수 없습니다') ||
                              answer.includes('답변을 생성할 수 없습니다');
        
        if (contexts.length === 0 || isErrorAnswer) {
            status = 'failed';
        } else if (contexts.length < 3) {
            status = 'partial';
        }

        // 질문 요약 생성 (최대 30자)
        const questionSummary = question.length > 27 
            ? question.slice(0, 27) + '...' 
            : question;

        // 소스 정보 구성 (타입별로 분리)
        const sources = contexts.map(ctx => {
            // 메타데이터에서 type 추출 (저장 시 type 필드에 저장됨)
            const itemType = ctx.metadata?.type || 'commit'; // 'commit' | 'diff' | 'file'
            
            // 타입에 따라 소스 정보 구성
            if (itemType === 'file') {
                // 파일 타입: code (소스 코드)
                // 파일 메타데이터: path, fileType, size, extension, sha (파일의 최신 커밋 SHA)
                return {
                    type: 'code' as const,
                    filePath: ctx.metadata?.path || ctx.metadata?.filePath || '',
                    commitHash: ctx.metadata?.sha || ctx.metadata?.commitId || '', // 파일의 경우 sha는 최신 커밋 SHA
                    commitMessage: '',
                    relevanceScore: ctx.score || 0,
                };
            } else if (itemType === 'diff') {
                // Diff 타입: history (변경 이력)
                // Diff는 commitId를 통해 커밋 정보를 참조할 수 있지만, 
                // 직접적인 commit message는 없으므로 빈 문자열
                return {
                    type: 'history' as const,
                    filePath: ctx.metadata?.filePath || '',
                    commitHash: ctx.metadata?.commitId || ctx.metadata?.sha || '',
                    commitMessage: '', // Diff에는 직접적인 commit message가 없음
                    relevanceScore: ctx.score || 0,
                };
            } else {
                // Commit 타입: commit (히스토리)
                // affectedFiles는 JSON 문자열로 저장되어 있으므로 파싱 필요
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

        // 4. Supabase에 이력 저장 (부수 효과, 실패해도 응답 흐름 중단 안됨)
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
                db_save_time_ms: 0, // 저장 완료 후 업데이트는 생략 (응답 속도 우선)
                token_usage: usage.totalTokens,
                prompt_tokens: usage.promptTokens,
                completion_tokens: usage.completionTokens,
                embedding_tokens: 0, // 임베딩 토큰은 별도 추적 필요 (현재는 0)
            });
        } catch (dbError: any) {
            // Supabase 저장 실패는 로그만 남기고 계속 진행
            console.warn('⚠️ Supabase 이력 저장 실패:', dbError.message);
        }
        const dbSaveTimeMs = Date.now() - dbSaveStartTime;

        console.log(`✅ 답변 생성 완료 (${responseTimeMs}ms)`);
        console.log(`   📊 단계별 시간: 분류=${classificationTimeMs}ms, 검색=${vectorSearchTimeMs}ms, LLM=${llmGenerationTimeMs}ms, DB=${dbSaveTimeMs}ms`);

        // 5. 클라이언트 응답
        // 참고: Q&A 임베딩 저장은 서비스가 아닌 별도 파이프라인에서 처리됩니다
        res.json({
            answer,
            sources,
            category,
            categoryConfidence: confidence,
            status,
            responseTimeMs,
            tokenUsage: usage.totalTokens,
            sessionId, // 세션 ID 반환 (프론트엔드에서 다음 질문에 사용)

            // 상세 시간 정보 (선택적)
            timings: {
                classification: classificationTimeMs,
                vectorSearch: vectorSearchTimeMs,
                llmGeneration: llmGenerationTimeMs,
                dbSave: dbSaveTimeMs,
                total: responseTimeMs,
            },

            // 토큰 상세 정보 (선택적)
            tokens: {
                prompt: usage.promptTokens,
                completion: usage.completionTokens,
                embedding: 0, // 임베딩 토큰은 벡터 검색에서 별도 추적 필요
                total: usage.totalTokens,
            },
        });

    } catch (error: any) {
        console.error('❌ 질의응답 오류:', error.message);
        res.status(500).json({ 
            error: '답변 생성 중 오류가 발생했습니다.',
            message: error.message,
        });
    }
});

export default router;

