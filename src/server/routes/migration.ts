/**
 * 마이그레이션 라우터
 * Supabase 테이블 초기화
 */
import { Router, type Request, type Response, type IRouter } from 'express';
import { checkTableExists, getSchemaSQL, initializeTables, ensureTablesExist } from '../services/supabaseMigration.js';

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
 * POST /api/migration/run
 * 자동 마이그레이션 실행
 */
router.post('/run', async (_req: Request, res: Response) => {
    try {
        const result = await initializeTables();
        
        if (result.success) {
            res.json({ success: true, message: result.message });
        } else {
            res.status(400).json({ success: false, message: result.message });
        }
    } catch (error: any) {
        console.error('❌ 마이그레이션 실행 오류:', error.message);
        res.status(500).json({ error: '마이그레이션 실행 중 오류가 발생했습니다.' });
    }
});

/**
 * POST /api/migration/ensure
 * 테이블이 없으면 자동으로 생성
 */
router.post('/ensure', async (_req: Request, res: Response) => {
    try {
        const success = await ensureTablesExist();
        res.json({ success, message: success ? '모든 테이블이 준비되었습니다.' : '테이블 생성에 실패했습니다.' });
    } catch (error: any) {
        console.error('❌ 테이블 확인 오류:', error.message);
        res.status(500).json({ error: '테이블 확인 중 오류가 발생했습니다.' });
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

