/**
 * Reusable health check logic (extracted from health.ts route)
 */
import { createClient } from '@supabase/supabase-js';

// Cache for health checks
interface HealthCache {
  connected: boolean;
  timestamp: number;
}

const CACHE_TTL = 60000; // 1 minute
let supabaseCache: HealthCache | null = null;

export async function checkSupabaseConnection(): Promise<boolean> {
  const now = Date.now();

  if (supabaseCache && now - supabaseCache.timestamp < CACHE_TTL) {
    return supabaseCache.connected;
  }

  const { env } = await import('../../shared/config/env.js');
  const supabaseUrl = env.SUPABASE_URL();
  const supabaseKey = env.SUPABASE_ANON_KEY();

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

