/**
 * 헬스체크 라우터
 */
import { Router, type Request, type Response, type IRouter } from 'express';
import { checkSupabaseConnection } from '../services/supabase.js';

const router: IRouter = Router();

// Supabase 연결 상태 캐시
let supabaseCache: {
    connected: boolean;
    timestamp: number;
} | null = null;
const CACHE_TTL = 1000 * 60; // 1분 캐시

/**
 * GET /api/health
 * 서버 상태 확인 (캐싱 적용)
 */
router.get('/', async (_req: Request, res: Response) => {
    // 캐시 확인
    const now = Date.now();
    let supabaseConnected: boolean;
    
    if (supabaseCache && (now - supabaseCache.timestamp) < CACHE_TTL) {
        supabaseConnected = supabaseCache.connected;
    } else {
        // 캐시가 없거나 만료되었으면 실제 확인
        supabaseConnected = await checkSupabaseConnection();
        supabaseCache = { connected: supabaseConnected, timestamp: now };
    }

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

