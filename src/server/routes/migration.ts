/**
 * 마이그레이션 라우터
 * Supabase 테이블 초기화
 */
import { Router, type Request, type Response, type IRouter } from 'express';
import { checkTableExists, getSchemaSQL } from '../services/supabaseMigration.js';

const router: IRouter = Router();

/**
 * GET /api/migration/status
 * 테이블 존재 여부 확인
 */
router.get('/status', async (_req: Request, res: Response) => {
    try {
        const qaHistoryExists = await checkTableExists('qa_history');
        const serverLogExists = await checkTableExists('server_status_log');

        res.json({
            qa_history: qaHistoryExists,
            server_status_log: serverLogExists,
            allTablesExist: qaHistoryExists && serverLogExists,
        });
    } catch (error: any) {
        console.error('❌ 마이그레이션 상태 확인 오류:', error.message);
        res.status(500).json({ error: '마이그레이션 상태 확인 중 오류가 발생했습니다.' });
    }
});

/**
 * GET /api/migration/schema
 * 테이블 스키마 SQL 반환
 */
router.get('/schema', (_req: Request, res: Response) => {
    try {
        const schema = getSchemaSQL();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(schema);
    } catch (error: any) {
        console.error('❌ 스키마 조회 오류:', error.message);
        res.status(500).json({ error: '스키마 조회 중 오류가 발생했습니다.' });
    }
});

export default router;

