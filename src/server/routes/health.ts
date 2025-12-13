/**
 * 헬스체크 라우터
 */
import { Router, type Request, type Response, type IRouter } from 'express';
import { checkSupabaseConnection } from '../services/supabase.js';

const router: IRouter = Router();

/**
 * GET /api/health
 * 서버 상태 확인
 */
router.get('/', async (_req: Request, res: Response) => {
    const supabaseConnected = await checkSupabaseConnection();

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            api: 'online',
            supabase: supabaseConnected ? 'connected' : 'disconnected',
        },
    });
});

export default router;

