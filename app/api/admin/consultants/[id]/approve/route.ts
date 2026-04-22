import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';
import { audit } from '@/lib/security/audit';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  const supa = supabaseService();
  await supa.from('consultants').update({
    is_approved: true, approved_at: new Date().toISOString(), approved_by: auth.consultant.id,
  }).eq('id', params.id);
  await audit(supa, auth.consultant.id, 'approve_consultant', { type: 'consultant', id: params.id });
  return NextResponse.json({ ok: true });
}
