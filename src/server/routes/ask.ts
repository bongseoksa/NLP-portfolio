/**
 * 질의응답 라우터
 */
import { Router, type Request, type Response, type IRouter } from 'express';
import { searchVectors } from '../../vector_store/searchVectors.js';
import { generateAnswer } from '../../qa/answer.js';
import { saveQAHistory } from '../services/supabase.js';
import { classifyQuestionWithConfidence } from '../../qa/classifier.js';
import { saveQAToVector } from '../../vector_store/saveQAToVector.js';
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
        // 1. 질문 분류 (LLM 호출 이전, rule-based)
        const { category, confidence } = classifyQuestionWithConfidence(question);
        console.log(`📂 질문 분류: ${category} (신뢰도: ${confidence})`);

        const repoName = process.env.TARGET_REPO_NAME || 'portfolio';
        // 모든 타입(commit, diff, file)이 저장된 컬렉션
        // 기존 컬렉션 이름과의 호환성을 위해 두 가지 모두 시도
        let collectionName = `${repoName}-vectors`;
        let contexts = await searchVectors(collectionName, question, 5);
        
        // 기존 컬렉션 이름으로 fallback
        if (contexts.length === 0) {
            console.log(`   → ${collectionName} 컬렉션이 없어 기존 컬렉션 시도 중...`);
            collectionName = `${repoName}-commits`;
            contexts = await searchVectors(collectionName, question, 5);
        }

        console.log(`🔍 API 질의: "${question}"`);

        // 2. 벡터 검색 (위에서 이미 수행됨)
        console.log(`   → ${contexts.length}개 문서 검색됨 (컬렉션: ${collectionName})`);

        // 답변 생성
        const answer = await generateAnswer(question, contexts);
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

        // 3. Supabase에 이력 저장 (부수 효과, 실패해도 응답 흐름 중단 안됨)
        try {
            await saveQAHistory({
                question,
                question_summary: questionSummary,
                answer,
                category,
                category_confidence: confidence,
                sources,
                status,
                response_time_ms: responseTimeMs,
                token_usage: 0, // TODO: 토큰 사용량 추적
            });
        } catch (dbError: any) {
            // Supabase 저장 실패는 로그만 남기고 계속 진행
            console.warn('⚠️ Supabase 이력 저장 실패:', dbError.message);
        }

        console.log(`✅ 답변 생성 완료 (${responseTimeMs}ms)`);

        // 4. Q&A를 벡터 DB에 저장 (백그라운드, 실패해도 응답 흐름 중단 안됨)
        // 성공한 답변만 저장 (failed 상태는 제외)
        if (status !== 'failed') {
            saveQAToVector(collectionName, question, answer, sessionId, {
                category,
                categoryConfidence: confidence,
                status,
            }).catch(err => {
                console.warn('⚠️ Q&A 벡터 저장 실패 (무시됨):', err.message);
            });
        }

        // 5. 클라이언트 응답
        res.json({
            answer,
            sources,
            category,
            categoryConfidence: confidence,
            status,
            responseTimeMs,
            tokenUsage: 0,
            sessionId, // 세션 ID 반환 (프론트엔드에서 다음 질문에 사용)
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

