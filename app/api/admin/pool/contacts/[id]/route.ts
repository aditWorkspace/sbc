import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';
import { audit } from '@/lib/security/audit';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  const supa = supabaseService();
  await supa.from('contacts').delete().eq('id', params.id);
  await audit(supa, auth.consultant.id, 'pool_row_delete', { type: 'contact', id: params.id });
  return NextResponse.json({ ok: true });
}
