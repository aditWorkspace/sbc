import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';
import { audit } from '@/lib/security/audit';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  const supa = supabaseService();
  const { data: c } = await supa.from('consultants').select('auth_user_id').eq('id', params.id).single();
  if (c?.auth_user_id) {
    await supa.auth.admin.signOut(c.auth_user_id, 'global');
  }
  await supa.from('consultants').update({ sessions_revoked_at: new Date().toISOString() }).eq('id', params.id);
  await audit(supa, auth.consultant.id, 'force_signout_consultant', { type: 'consultant', id: params.id });
  return NextResponse.json({ ok: true });
}
