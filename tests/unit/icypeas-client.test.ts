import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { icypeasBulkMatch, IcypeasCreditsExhausted, IcypeasRateLimit } from '@/lib/icypeas/client';

// Env shim — lib/env parses process.env lazily, and this module-level assignment has to happen before import chain resolves env access.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://t.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'p';
process.env.SUPABASE_SERVICE_ROLE_KEY = 's';
process.env.ICYPEAS_API_KEY = 'ic';
process.env.ICYPEAS_SECRET_API_KEY = 'sk';
process.env.ICYPEAS_USER_ID = 'u';
process.env.OPENROUTER_API_KEY = 'o';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'cs';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3010/oauth/callback';
process.env.CRON_SECRET = 'x'.repeat(32);

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('icypeasBulkMatch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 5 });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Real Icypeas response shape (verified against live API 2026-04-22):
  //   poll returns { success, items: [{ _id, status: 'FOUND', results: { firstname, lastname, emails: [{email, certainty}], company_name, domain } }] }
  const pollItem = (overrides: Record<string, unknown>) =>
    mockResponse({ success: true, items: [{ _id: 'abc', ...overrides }] });

  it('submits and polls, returns parsed person', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockResponse({ success: true, item: { _id: 'abc', status: 'NONE' } }))
      .mockResolvedValueOnce(pollItem({ status: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(pollItem({
        status: 'FOUND',
        results: {
          firstname: 'Elon', lastname: 'Musk',
          emails: [{ email: 'elon@tesla.com', certainty: 'ultra_sure' }],
          company_name: 'Tesla',
        },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const promise = icypeasBulkMatch([{ first_name: 'Elon', last_name: 'Musk', organization_name: 'Tesla' }]);
    await vi.advanceTimersByTimeAsync(2100);
    await vi.advanceTimersByTimeAsync(2100);
    const r = await promise;
    expect(r.matches.length).toBe(1);
    expect(r.matches[0]).toMatchObject({
      email: 'elon@tesla.com',
      email_status: 'verified',
      organization: { name: 'Tesla' },
    });
  });

  it('maps low-certainty to guessed', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(mockResponse({ success: true, item: { _id: 'abc', status: 'NONE' } }))
      .mockResolvedValueOnce(pollItem({
        status: 'FOUND',
        results: { emails: [{ email: 'maybe@x.com', certainty: 'likely' }] },
      })));
    const promise = icypeasBulkMatch([{ first_name: 'A', last_name: 'B', organization_name: 'C' }]);
    await vi.advanceTimersByTimeAsync(2100);
    const r = await promise;
    expect(r.matches[0]?.email_status).toBe('guessed');
  });

  it('returns null for item with no emails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(mockResponse({ success: true, item: { _id: 'abc', status: 'NONE' } }))
      .mockResolvedValueOnce(pollItem({
        status: 'NOT_FOUND',
        results: { emails: [] },
      })));
    const promise = icypeasBulkMatch([{ first_name: 'A', last_name: 'B', organization_name: 'C' }]);
    await vi.advanceTimersByTimeAsync(2100);
    const r = await promise;
    expect(r.matches[0]).toBeNull();
  });

  it('throws IcypeasCreditsExhausted on 402', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 402 })));
    await expect(icypeasBulkMatch([{ first_name: 'A', last_name: 'B', organization_name: 'C' }]))
      .rejects.toBeInstanceOf(IcypeasCreditsExhausted);
  });

  it('throws IcypeasRateLimit on 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 429 })));
    await expect(icypeasBulkMatch([{ first_name: 'A', last_name: 'B', organization_name: 'C' }]))
      .rejects.toBeInstanceOf(IcypeasRateLimit);
  });

  it('rejects > 10 details', async () => {
    const details = Array.from({ length: 11 }, () => ({ first_name: 'A', last_name: 'B', organization_name: 'C' }));
    await expect(icypeasBulkMatch(details)).rejects.toThrow(/10/);
  });
});
