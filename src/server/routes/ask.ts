/**
 * 질의응답 라우터
 */
import { Router, type Request, type Response, type IRouter } from 'express';
import { searchVectors } from '../../vector_store/searchVectors.js';
import { generateAnswer } from '../../qa/answer.js';
import { saveQAHistory } from '../services/supabase.js';

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
    
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
        console.error('❌ 잘못된 요청: question이 없거나 문자열이 아님');
        res.status(400).json({ error: '질문을 입력해주세요.' });
        return;
    }

    try {
        const repoName = process.env.TARGET_REPO_NAME || 'portfolio';
        const collectionName = `${repoName}-commits`;

        console.log(`🔍 API 질의: "${question}"`);

        // 벡터 검색
        const contexts = await searchVectors(collectionName, question, 5);
        console.log(`   → ${contexts.length}개 문서 검색됨`);

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

        // 소스 정보 구성
        const sources = contexts.map(ctx => ({
            type: 'commit' as const,
            commitHash: ctx.metadata?.sha || '',
            commitMessage: ctx.metadata?.message || '',
            filePath: ctx.metadata?.files?.[0] || '',
            relevanceScore: ctx.score || 0,
        }));

        // Supabase에 이력 저장
        await saveQAHistory({
            question,
            question_summary: questionSummary,
            answer,
            category: 'unknown', // TODO: 질문 분류 기능 추가
            category_confidence: 0,
            sources,
            status,
            response_time_ms: responseTimeMs,
            token_usage: 0, // TODO: 토큰 사용량 추적
        });

        console.log(`✅ 답변 생성 완료 (${responseTimeMs}ms)`);

        res.json({
            answer,
            sources,
            category: 'unknown',
            categoryConfidence: 0,
            status,
            responseTimeMs,
            tokenUsage: 0,
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

