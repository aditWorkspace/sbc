import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { Database } from './types';

// Next.js extends global fetch with implicit caching, so without this wrapper
// Supabase's GET queries can return stale rows for the same URL+body. Forces
// every request through the network. Discovered the hard way 2026-04-30: the
// /api/cron/enrich drain kept "picking" company IDs that no longer existed in
// the database — Next.js was serving cached SELECT responses.
const noCacheFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

// Bypasses RLS — use only from trusted server code (API routes, cron workers).
export function supabaseService() {
  return createClient<Database>(
    env().NEXT_PUBLIC_SUPABASE_URL,
    env().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: noCacheFetch },
    },
  );
}
