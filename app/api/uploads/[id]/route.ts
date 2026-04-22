import { NextResponse } from 'next/server';
import { requireApprovedConsultant } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApprovedConsultant();
  if ('error' in auth)
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === 'forbidden' ? 403 : 401 },
    );

  const supa = supabaseService();
  const { data: upload } = await supa.from('uploads').select('*').eq('id', params.id).single();
  if (!upload) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Authz: only the uploader OR an admin can read
  if (upload.consultant_id !== auth.consultant.id && !auth.consultant.is_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [enr, pen] = await Promise.all([
    supa
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('upload_id', params.id)
      .eq('enrichment_status', 'enriched'),
    supa
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('upload_id', params.id)
      .eq('enrichment_status', 'pending'),
  ]);

  return NextResponse.json({
    id: upload.id,
    status: upload.status,
    row_count_raw: upload.row_count_raw,
    row_count_admitted: upload.row_count_admitted,
    row_count_rejected: upload.row_count_rejected,
    row_count_archived: upload.row_count_archived,
    row_count_already_in_pool: upload.row_count_already_in_pool,
    enriched: enr.count ?? 0,
    pending: pen.count ?? 0,
  });
}
