import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  await supabaseService().from('contacts').delete().eq('id', params.id);
  return NextResponse.json({ ok: true });
}
