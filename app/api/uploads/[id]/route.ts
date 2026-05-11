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

  // Diagnostic: companies where Icypeas returned NOT_FOUND for everyone we sent.
  // Almost always a typo in the CSV's company column ("Spofity" → meant Spotify).
  // Without this, consultants see "0 added to pool, 252 couldn't be matched" and
  // assume the system is broken; in reality their CSV had a bad column value.
  // Scope to apollo_samples created at-or-after the upload, then filter to
  // companies that this upload touched (had any contact at) AND that have zero
  // enriched contacts from this upload.
  const notFoundCompanies = await getNotFoundCompaniesForUpload(supa, upload);

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
    not_found_companies: notFoundCompanies,
  });
}

async function getNotFoundCompaniesForUpload(
  supa: ReturnType<typeof supabaseService>,
  upload: { id: string; uploaded_at: string },
): Promise<string[]> {
  // 1. apollo_samples with reason='not_found' written after this upload's start.
  //    A sloppy time-window join, but apollo_samples doesn't carry upload_id and
  //    a schema change is out of scope. Anything created BEFORE the upload can't
  //    have come from it; anything after is a candidate.
  const { data: nfSamples } = await supa
    .from('apollo_samples')
    .select('company_id')
    .eq('email_ignored_reason', 'not_found')
    .gte('created_at', upload.uploaded_at);
  if (!nfSamples || nfSamples.length === 0) return [];
  const candidateCompanyIds = Array.from(new Set(nfSamples.map((s: { company_id: string }) => s.company_id)));

  // 2. Among candidates, restrict to companies THIS upload actually had contacts
  //    at. Some contacts may have been deleted (NOT_FOUND), but at least one
  //    enriched/pending one usually survives — if not, fall back to any contact
  //    historically tied to this upload_id.
  const { data: touched } = await supa
    .from('contacts')
    .select('company_id')
    .eq('upload_id', upload.id)
    .in('company_id', candidateCompanyIds);
  const touchedSet = new Set((touched ?? []).map((c: { company_id: string }) => c.company_id));
  // If contacts table is empty for the upload (everyone got NOT_FOUND), fall
  // back to ALL candidate companies in the time window — at the cost of false
  // positives if multiple uploads ran concurrently. Acceptable trade-off.
  const target = touchedSet.size > 0 ? [...touchedSet] : candidateCompanyIds;
  if (target.length === 0) return [];

  // 3. Filter out companies that have at least one enriched contact from THIS
  //    upload — those weren't a complete miss.
  const { data: enrichedAtCompanies } = await supa
    .from('contacts')
    .select('company_id')
    .eq('upload_id', upload.id)
    .eq('enrichment_status', 'enriched')
    .in('company_id', target);
  const partialOk = new Set((enrichedAtCompanies ?? []).map((c: { company_id: string }) => c.company_id));
  const fullMisses = target.filter(id => !partialOk.has(id));
  if (fullMisses.length === 0) return [];

  // 4. Resolve display names.
  const { data: cos } = await supa
    .from('companies')
    .select('display_name')
    .in('id', fullMisses);
  return (cos ?? []).map((c: { display_name: string }) => c.display_name).sort();
}
