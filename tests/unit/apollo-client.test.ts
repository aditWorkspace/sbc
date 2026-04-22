import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apolloBulkMatch, ApolloCreditsExhausted, ApolloRateLimit } from '@/lib/apollo/client';

// Minimal env for tests — lib/env reads process.env lazily
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://t.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'p';
process.env.SUPABASE_SERVICE_ROLE_KEY = 's';
process.env.APOLLO_API_KEY = 'a';
process.env.OPENROUTER_API_KEY = 'or-test';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'cs';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3010/oauth/callback';
process.env.CRON_SECRET = 'x'.repeat(32);

describe('apolloBulkMatch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns matches array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ matches: [{ email: 'a@b.com', email_status: 'verified' }] }),
      { status: 200 }
    )));
    const r = await apolloBulkMatch([{ first_name:'A', last_name:'B', organization_name:'C' }]);
    expect(r.matches.length).toBe(1);
  });

  it('throws ApolloCreditsExhausted on 402', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 402 })));
    await expect(apolloBulkMatch([{ first_name:'A', last_name:'B', organization_name:'C' }]))
      .rejects.toBeInstanceOf(ApolloCreditsExhausted);
  });

  it('throws ApolloRateLimit on 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(apolloBulkMatch([{ first_name:'A', last_name:'B', organization_name:'C' }]))
      .rejects.toBeInstanceOf(ApolloRateLimit);
  });

  it('throws on >10 details', async () => {
    const details = Array.from({ length: 11 }, () => ({ first_name:'A', last_name:'B', organization_name:'C' }));
    await expect(apolloBulkMatch(details)).rejects.toThrow(/10/);
  });
});
