/**
 * Reusable health check logic (extracted from health.ts route)
 */
import { createClient } from '@supabase/supabase-js';
import http from 'http';

// Cache for health checks
interface HealthCache {
  connected: boolean;
  timestamp: number;
}

const CACHE_TTL = 60000; // 1 minute
let supabaseCache: HealthCache | null = null;
let chromadbCache: HealthCache | null = null;

export async function checkSupabaseConnection(): Promise<boolean> {
  const now = Date.now();

  if (supabaseCache && now - supabaseCache.timestamp < CACHE_TTL) {
    return supabaseCache.connected;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    supabaseCache = { connected: false, timestamp: now };
    return false;
  }

  try {
    const client = createClient(supabaseUrl, supabaseKey);
    const { error } = await client.from('qa_history').select('id').limit(1);
    const connected = !error;
    supabaseCache = { connected, timestamp: now };
    return connected;
  } catch {
    supabaseCache = { connected: false, timestamp: now };
    return false;
  }
}

export async function checkChromaDBHealth(): Promise<boolean> {
  const now = Date.now();

  if (chromadbCache && now - chromadbCache.timestamp < CACHE_TTL) {
    return chromadbCache.connected;
  }

  const checkEndpoint = (path: string): Promise<boolean> => {
    return new Promise((resolve) => {
      let resolved = false;

      const req = http.request(
        { hostname: 'localhost', port: 8000, path, method: 'GET' },
        (res) => {
          if (!resolved) {
            resolved = true;
            res.on('data', () => {});
            res.on('end', () => resolve(true));
          }
        }
      );

      req.on('error', (error: any) => {
        if (!resolved) {
          resolved = true;
          resolve(error.code !== 'ECONNREFUSED');
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          req.destroy();
          resolve(false);
        }
      }, 2000);

      req.end();
    });
  };

  try {
    const v2Result = await checkEndpoint('/api/v2/heartbeat');
    if (v2Result) {
      chromadbCache = { connected: true, timestamp: now };
      return true;
    }

    const v1Result = await checkEndpoint('/api/v1/heartbeat');
    chromadbCache = { connected: v1Result, timestamp: now };
    return v1Result;
  } catch {
    chromadbCache = { connected: false, timestamp: now };
    return false;
  }
}
