/**
 * Express API 서버
 * 프론트엔드와 연동하여 질의응답 서비스 제공
 */
import dotenv from 'dotenv';
dotenv.config();

import express, { type Express } from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import askRouter from './routes/ask.js';
import historyRouter from './routes/history.js';
import migrationRouter from './routes/migration.js';

const app: Express = express();
const PORT = process.env.API_PORT || 3001;

// 미들웨어
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
}));
app.use(express.json());

// 요청 로깅
app.use((req, _res, next) => {
    console.log(`📨 ${req.method} ${req.path}`);
    next();
});

// 라우터 등록
app.use('/api/health', healthRouter);
app.use('/api/ask', askRouter);
app.use('/api/history', historyRouter);
app.use('/api/migration', migrationRouter);

// 대시보드 통계 라우터 (history 라우터에서 분리)
app.get('/api/dashboard/summary', async (_req, res) => {
    try {
        const { getDashboardStats } = await import('./services/supabase.js');
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

// 일별 통계 조회
app.get('/api/dashboard/daily', async (req, res) => {
    try {
        const { getDailyStats } = await import('./services/supabase.js');
        const startDate = req.query.startDate as string | undefined;
        const endDate = req.query.endDate as string | undefined;
        const stats = await getDailyStats(startDate, endDate);
        res.json(stats);
    } catch (error: any) {
        console.error('❌ 일별 통계 조회 오류:', error.message);
        res.status(500).json({ error: '일별 통계 조회 중 오류가 발생했습니다.' });
    }
});

// 카테고리 분포 조회
app.get('/api/dashboard/categories', async (_req, res) => {
    try {
        const { getCategoryDistribution } = await import('./services/supabase.js');
        const distribution = await getCategoryDistribution();
        res.json(distribution);
    } catch (error: any) {
        console.error('❌ 카테고리 분포 조회 오류:', error.message);
        res.status(500).json({ error: '카테고리 분포 조회 중 오류가 발생했습니다.' });
    }
});

// 소스 기여도 조회
app.get('/api/dashboard/sources', async (_req, res) => {
    try {
        const { getSourceContribution } = await import('./services/supabase.js');
        const contribution = await getSourceContribution();
        res.json(contribution);
    } catch (error: any) {
        console.error('❌ 소스 기여도 조회 오류:', error.message);
        res.status(500).json({ error: '소스 기여도 조회 중 오류가 발생했습니다.' });
    }
});

// 404 핸들러
app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// 에러 핸들러
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('❌ 서버 오류:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`
🚀 API Server is running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 URL: http://localhost:${PORT}
📋 Endpoints:
   GET  /api/health              - 서버 상태 확인
   GET  /api/health/chromadb     - ChromaDB 상태 확인
   POST /api/ask                 - 질의응답
   GET  /api/history             - 이력 조회
   GET  /api/dashboard/summary    - 대시보드 통계
   GET  /api/dashboard/daily     - 일별 통계
   GET  /api/dashboard/categories - 카테고리 분포
   GET  /api/dashboard/sources   - 소스 기여도
━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
});

export default app;

