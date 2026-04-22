import { describe, it, expect } from 'vitest';
import { parseEnv } from '@/lib/env';

describe('parseEnv', () => {
  const base = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://xyz.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pubkey',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    ICYPEAS_API_KEY: 'ic',
    ICYPEAS_SECRET_API_KEY: 'sk',
    ICYPEAS_USER_ID: 'u',
    OPENROUTER_API_KEY: 'or',
    GOOGLE_OAUTH_CLIENT_ID: 'cid',
    GOOGLE_OAUTH_CLIENT_SECRET: 'cs',
    GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3010/oauth/callback',
    CRON_SECRET: 'x'.repeat(32),
  };
  it('accepts valid env', () => {
    expect(() => parseEnv(base)).not.toThrow();
  });
  it('rejects short CRON_SECRET', () => {
    expect(() => parseEnv({ ...base, CRON_SECRET: 'short' })).toThrow(/CRON_SECRET/);
  });
  it('rejects missing Supabase URL', () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _, ...rest } = base;
    expect(() => parseEnv(rest)).toThrow();
  });
  it('rejects missing publishable key', () => {
    const { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: _, ...rest } = base;
    expect(() => parseEnv(rest)).toThrow();
  });
});
