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

        res.json(history);
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

        res.json(record);
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

