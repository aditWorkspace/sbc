import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireOwner();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  const supa = supabaseService();
  const { data: c } = await supa.from('consultants').select('auth_user_id').eq('id', params.id).single();
  if (c?.auth_user_id) {
    await supa.auth.admin.deleteUser(c.auth_user_id);
  }
  await supa.from('consultants').update({
    deactivated_at: new Date().toISOString(),
    deactivated_by: auth.consultant.id,
    auth_user_id: null,
    is_approved: false,
  }).eq('id', params.id);
  return NextResponse.json({ ok: true });
}
