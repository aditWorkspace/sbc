import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveConsultantForSession } from '@/lib/auth/resolve';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://t.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'p';
process.env.SUPABASE_SERVICE_ROLE_KEY = 's';
process.env.APOLLO_API_KEY = 'a';
process.env.OPENROUTER_API_KEY = 'o';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'cs';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3010/oauth/callback';
process.env.CRON_SECRET = 'x'.repeat(32);

const rpcMock = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  supabaseService: () => ({ rpc: rpcMock }),
}));

describe('resolveConsultantForSession', () => {
  beforeEach(() => rpcMock.mockReset());

  it('calls RPC and returns row', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'c1', is_approved: true }, error: null });
    const r = await resolveConsultantForSession({
      id: 'u1', email: 'a@berkeley.edu',
      user_metadata: { full_name: 'Ava' },
    } as any);
    expect(rpcMock).toHaveBeenCalledWith('resolve_consultant', {
      p_auth_user_id: 'u1', p_email: 'a@berkeley.edu', p_display_name: 'Ava',
    });
    expect((r as any)?.id).toBe('c1');
  });

  it('returns null on RPC error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('x') });
    const r = await resolveConsultantForSession({ id: 'u1', email: 'a@berkeley.edu' } as any);
    expect(r).toBeNull();
  });

  it('returns null when user has no email', async () => {
    const r = await resolveConsultantForSession({ id: 'u1' } as any);
    expect(r).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
