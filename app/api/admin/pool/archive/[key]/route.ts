import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';
import { audit } from '@/lib/security/audit';

export async function DELETE(_req: Request, { params }: { params: { key: string } }) {
  const auth = await requireOwner();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  const supa = supabaseService();
  const key = decodeURIComponent(params.key);
  await supa.from('dedup_archive').delete().eq('normalized_key', key);
  await audit(supa, auth.consultant.id, 'archive_release', { type: 'archive', id: key });
  return NextResponse.json({ ok: true });
}
