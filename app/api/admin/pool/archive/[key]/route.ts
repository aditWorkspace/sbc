import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';

export async function DELETE(_req: Request, { params }: { params: { key: string } }) {
  const auth = await requireOwner();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  await supabaseService().from('dedup_archive').delete().eq('normalized_key', decodeURIComponent(params.key));
  return NextResponse.json({ ok: true });
}
