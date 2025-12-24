/**
 * 이력 조회 라우터
 */
import { Router, type Request, type Response, type IRouter } from 'express';
import { getQAHistory, getQAHistoryById, getDashboardStats } from '../services/supabase.js';

const router: IRouter = Router();

/**
 * GET /api/history
 * 질문-응답 이력 조회
 */
router.get('/', async (req: Request, res: Response) => {
    const { search, category, limit, offset } = req.query;

    try {
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
            
            const transformed = {
                id: record.id,
                question: record.question,
                questionSummary: record.question_summary || record.questionSummary || '',
                answer: record.answer,
                category: record.category,
                categoryConfidence: record.category_confidence ?? record.categoryConfidence ?? 0,
                sources: record.sources || [],
                status: record.status,
                responseTimeMs: responseTime,
                tokenUsage: typeof record.token_usage === 'number' 
                    ? record.token_usage 
                    : (typeof record.tokenUsage === 'number' ? record.tokenUsage : 0),
                createdAt: record.created_at || record.createdAt || '',
            };
            
            return transformed;
        });

        res.json(transformedHistory);
    } catch (error: any) {
        console.error('❌ 이력 조회 오류:', error.message);
        res.status(500).json({ error: '이력 조회 중 오류가 발생했습니다.' });
    }
});

/**
 * GET /api/history/:id
 * 특정 이력 조회
 */
router.get('/:id', async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!id) {
        res.status(400).json({ error: 'ID가 필요합니다.' });
        return;
    }

    try {
        const record = await getQAHistoryById(id);

        if (!record) {
            res.status(404).json({ error: '이력을 찾을 수 없습니다.' });
            return;
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
            responseTimeMs: record.response_time_ms || 0,
            tokenUsage: record.token_usage || 0,
            createdAt: record.created_at,
        };

        res.json(transformedRecord);
    } catch (error: any) {
        console.error('❌ 이력 조회 오류:', error.message);
        res.status(500).json({ error: '이력 조회 중 오류가 발생했습니다.' });
    }
});

/**
 * GET /api/dashboard/summary
 * 대시보드 요약 통계
 */
router.get('/dashboard/summary', async (_req: Request, res: Response) => {
    try {
        const stats = await getDashboardStats();
        
        res.json({
            ...stats,
            serverStatus: 'online',
            lastSuccessfulResponse: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('❌ 대시보드 통계 조회 오류:', error.message);
        res.status(500).json({ error: '통계 조회 중 오류가 발생했습니다.' });
    }
});

export default router;

