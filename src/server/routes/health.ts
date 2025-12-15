/**
 * 헬스체크 라우터
 */
import { Router, type Request, type Response, type IRouter } from 'express';
import { checkSupabaseConnection } from '../services/supabase.js';
import http from 'http';

const router: IRouter = Router();

// Supabase 연결 상태 캐시
let supabaseCache: {
    connected: boolean;
    timestamp: number;
} | null = null;

// ChromaDB 연결 상태 캐시
let chromadbCache: {
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

/**
 * ChromaDB 헬스체크 함수 (http 모듈 사용)
 */
async function checkChromaDBHealth(): Promise<boolean> {
    // v2 API를 먼저 시도 (v1은 deprecated)
    const checkEndpoint = (path: string): Promise<boolean> => {
        return new Promise((resolve) => {
            let resolved = false;
            
            const options = {
                hostname: 'localhost',
                port: 8000,
                path: path,
                method: 'GET',
            };

            const req = http.request(options, (res) => {
                // 응답이 있으면 서버가 실행 중 (상태 코드와 관계없이)
                if (!resolved) {
                    resolved = true;
                    res.on('data', () => {});
                    res.on('end', () => {
                        resolve(true);
                    });
                }
            });

            req.on('error', (error: any) => {
                if (!resolved) {
                    resolved = true;
                    // 연결 거부 오류만 false
                    if (error.code === 'ECONNREFUSED') {
                        resolve(false);
                    } else {
                        // 다른 오류는 일단 true (서버는 실행 중일 수 있음)
                        resolve(true);
                    }
                }
            });

            // 타임아웃 설정
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    req.destroy();
                    resolve(false);
                }
            }, 2000);

            req.on('close', () => {
                clearTimeout(timeout);
            });

            req.end();
        });
    };

    try {
        // v2 API 시도
        const v2Result = await checkEndpoint('/api/v2/heartbeat');
        if (v2Result) {
            return true;
        }

        // v2가 실패하면 v1 API 시도 (fallback)
        const v1Result = await checkEndpoint('/api/v1/heartbeat');
        return v1Result;
    } catch (error: any) {
        console.error('[Health] ChromaDB health check error:', error.message);
        return false;
    }
}

/**
 * GET /api/health/chromadb
 * ChromaDB 상태 확인 (캐싱 적용)
 */
router.get('/chromadb', async (_req: Request, res: Response) => {
    // 캐시 확인
    const now = Date.now();
    let chromadbConnected: boolean;
    
    if (chromadbCache && (now - chromadbCache.timestamp) < CACHE_TTL) {
        chromadbConnected = chromadbCache.connected;
    } else {
        // 캐시가 없거나 만료되었으면 실제 확인
        chromadbConnected = await checkChromaDBHealth();
        console.log(`[Health] ChromaDB health check result: ${chromadbConnected}`);
        chromadbCache = { connected: chromadbConnected, timestamp: now };
    }

    res.json({
        status: chromadbConnected ? 'online' : 'offline',
        timestamp: new Date().toISOString(),
        service: 'chromadb',
        port: 8000,
    });
});

export default router;

