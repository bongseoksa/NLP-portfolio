/**
 * Control 서버
 * 프론트엔드에서 ChromaDB 및 API 서버를 제어하기 위한 관리 서버
 * 로컬 개발 환경에서만 사용
 */
import dotenv from 'dotenv';
dotenv.config();

import express, { type Express } from 'express';
import cors from 'cors';
import { processManager } from './processManager.js';

const app: Express = express();
const PORT = process.env.CONTROL_PORT || 3000;

// 미들웨어
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
}));
app.use(express.json());

// 요청 로깅
app.use((req, _res, next) => {
    console.log(`🔧 ${req.method} ${req.path}`);
    next();
});

/**
 * GET /control/status
 * 모든 서버 상태 조회
 */
app.get('/control/status', async (_req, res) => {
    const status = await processManager.getStatus();
    res.json(status);
});

/**
 * POST /control/chromadb/start
 * ChromaDB 서버 시작
 */
app.post('/control/chromadb/start', async (_req, res) => {
    console.log('🚀 ChromaDB 시작 요청...');
    const result = await processManager.startChromaDB();
    
    if (result.success) {
        console.log('✅ ChromaDB 시작됨');
    } else {
        console.log('❌ ChromaDB 시작 실패:', result.message);
    }
    
    res.json(result);
});

/**
 * POST /control/chromadb/stop
 * ChromaDB 서버 종료
 */
app.post('/control/chromadb/stop', async (_req, res) => {
    console.log('🛑 ChromaDB 종료 요청...');
    const result = await processManager.stopChromaDB();
    
    if (result.success) {
        console.log('✅ ChromaDB 종료됨');
    } else {
        console.log('❌ ChromaDB 종료 실패:', result.message);
    }
    
    res.json(result);
});

/**
 * POST /control/api/start
 * API 서버 시작
 */
app.post('/control/api/start', async (_req, res) => {
    console.log('🚀 API 서버 시작 요청...');
    const result = await processManager.startAPIServer();
    
    if (result.success) {
        console.log('✅ API 서버 시작됨');
    } else {
        console.log('❌ API 서버 시작 실패:', result.message);
    }
    
    res.json(result);
});

/**
 * POST /control/api/stop
 * API 서버 종료
 */
app.post('/control/api/stop', async (_req, res) => {
    console.log('🛑 API 서버 종료 요청...');
    const result = await processManager.stopAPIServer();
    
    if (result.success) {
        console.log('✅ API 서버 종료됨');
    } else {
        console.log('❌ API 서버 종료 실패:', result.message);
    }
    
    res.json(result);
});

/**
 * GET /control/logs/:server
 * 서버 로그 조회
 */
app.get('/control/logs/:server', (req, res) => {
    const { server } = req.params;
    
    if (server !== 'chromadb' && server !== 'api') {
        res.status(400).json({ error: 'Invalid server name' });
        return;
    }
    
    const logs = processManager.getLogs(server);
    res.json({ logs });
});

// 404 핸들러
app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// 종료 시 모든 프로세스 정리
process.on('SIGINT', async () => {
    console.log('\n🛑 Control 서버 종료 중...');
    await processManager.shutdownAll();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Control 서버 종료 중...');
    await processManager.shutdownAll();
    process.exit(0);
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`
🔧 Control Server is running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 URL: http://localhost:${PORT}
📋 Endpoints:
   GET  /control/status         - 서버 상태 조회
   POST /control/chromadb/start - ChromaDB 시작
   POST /control/chromadb/stop  - ChromaDB 종료
   POST /control/api/start      - API 서버 시작
   POST /control/api/stop       - API 서버 종료
   GET  /control/logs/:server   - 로그 조회
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  이 서버는 로컬 개발 환경에서만 사용하세요.
`);
});

export default app;

