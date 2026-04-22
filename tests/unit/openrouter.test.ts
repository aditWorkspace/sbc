import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openrouterJson } from '@/lib/llm/openrouter';
import { z } from 'zod';

const Schema = z.object({ ok: z.boolean() });

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

describe('openrouterJson', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).__llmCache?.clear?.();
    (globalThis as any).__llmSpent = 0;
  });

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
      { status: 200 }
    )));
    const r = await openrouterJson({ system: 's', user: 'u', schema: Schema });
    expect(r).toEqual({ ok: true });
  });

  it('falls through to next model on 429', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('rate', { status: 429 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
        { status: 200 }
      ));
    vi.stubGlobal('fetch', fetchMock);
    const r = await openrouterJson({ system: 's', user: 'u', schema: Schema });
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null on schema failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: '{"not_ok":1}' } }] }),
      { status: 200 }
    )));
    const r = await openrouterJson({ system: 's', user: 'u', schema: Schema });
    expect(r).toBeNull();
  });

  it('caches by (model, prompt)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
      { status: 200 }
    ));
    vi.stubGlobal('fetch', fetchMock);
    await openrouterJson({ system: 's', user: 'u', schema: Schema });
    await openrouterJson({ system: 's', user: 'u', schema: Schema });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
