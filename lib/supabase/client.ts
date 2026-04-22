'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

// Do NOT import `@/lib/env` here — it validates ALL env vars (including server-only
// ones), which browser bundles don't have. Read NEXT_PUBLIC_* vars directly; Next.js
// inlines them at build time.
export const supabaseBrowser = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — did `.env.local` get loaded?');
  }
  return createBrowserClient<Database>(url, key);
};
