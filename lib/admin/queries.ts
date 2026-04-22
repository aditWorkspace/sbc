import type { SupabaseClient } from '@supabase/supabase-js';

export type Range = 'day' | 'week' | 'month' | 'all';

export function rangeStart(r: Range): Date | null {
  const now = Date.now();
  if (r === 'day') return new Date(now - 86_400_000);
  if (r === 'week') return new Date(now - 7 * 86_400_000);
  if (r === 'month') return new Date(now - 30 * 86_400_000);
  return null;
}

export async function overviewKpis(supa: SupabaseClient, range: Range) {
  const since = rangeStart(range);
  const sinceIso = since?.toISOString();
  const [pool, uploaded, sheetsData, apollo, cache, topCompanies] = await Promise.all([
    supa.from('contacts').select('*', { count: 'exact', head: true }),
    sinceIso ? supa.from('uploads').select('row_count_admitted').gte('uploaded_at', sinceIso)
             : supa.from('uploads').select('row_count_admitted'),
    sinceIso ? supa.from('sheets').select('row_count').gte('created_at', sinceIso)
             : supa.from('sheets').select('row_count'),
    sinceIso ? supa.from('apollo_samples').select('credits_spent').gte('sampled_at', sinceIso)
             : supa.from('apollo_samples').select('credits_spent'),
    supa.from('companies').select('template_confidence'),
    supa.from('contacts').select('company_display'),
  ]);
  const uploadedRows = (uploaded.data ?? []).reduce((a: number, r: any) => a + (r.row_count_admitted ?? 0), 0);
  const sheetRows = (sheetsData.data ?? []).reduce((a: number, r: any) => a + (r.row_count ?? 0), 0);
  const credits = (apollo.data ?? []).reduce((a: number, r: any) => a + (r.credits_spent ?? 0), 0);
  const byConf: Record<string, number> = {};
  for (const r of (cache.data ?? [])) byConf[(r as any).template_confidence] = (byConf[(r as any).template_confidence] ?? 0) + 1;

  const topMap = new Map<string, number>();
  for (const r of (topCompanies.data ?? [])) {
    const n = (r as any).company_display as string;
    topMap.set(n, (topMap.get(n) ?? 0) + 1);
  }
  const top = [...topMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));

  return {
    pool: pool.count ?? 0,
    uploadedRows,
    sheetCount: (sheetsData.data ?? []).length,
    sheetRows,
    credits,
    confidenceBreakdown: byConf,
    topCompanies: top,
  };
}

export async function queueSnapshot(supa: SupabaseClient) {
  const [queued, running, pendingContacts] = await Promise.all([
    supa.from('enrichment_jobs').select('*', { count: 'exact', head: true }).eq('status', 'queued'),
    supa.from('enrichment_jobs').select('*', { count: 'exact', head: true }).eq('status', 'running'),
    supa.from('contacts').select('*', { count: 'exact', head: true }).eq('enrichment_status', 'pending'),
  ]);
  return {
    queued: queued.count ?? 0,
    running: running.count ?? 0,
    pendingContacts: pendingContacts.count ?? 0,
  };
}

export async function recentActivity(supa: SupabaseClient, limit = 10) {
  const { data } = await supa
    .from('apollo_samples')
    .select(
      'person_first_name, person_last_name, email_returned, email_ignored_reason, detected_pattern, detected_domain, sampled_at, company_id',
    )
    .order('sampled_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function perConsultantActivity(supa: SupabaseClient, range: Range) {
  const since = rangeStart(range);
  const sinceIso = since?.toISOString();
  const { data: consultants } = await supa.from('consultants').select('*').is('deactivated_at', null);
  const results = [] as Array<{
    id: string; display_name: string | null; email: string; is_admin: boolean; is_approved: boolean;
    last_active_at: string | null; uploaded_rows: number; sheets_pulled: number; rows_out: number; pct_own: string;
  }>;
  for (const c of (consultants ?? [])) {
    const [uploaded, sheetsOut] = await Promise.all([
      sinceIso
        ? supa.from('uploads').select('row_count_admitted').eq('consultant_id', c.id).gte('uploaded_at', sinceIso)
        : supa.from('uploads').select('row_count_admitted').eq('consultant_id', c.id),
      sinceIso
        ? supa.from('sheets').select('row_count, from_own_sourcing').eq('consultant_id', c.id).gte('created_at', sinceIso)
        : supa.from('sheets').select('row_count, from_own_sourcing').eq('consultant_id', c.id),
    ]);
    const uploadedRows = (uploaded.data ?? []).reduce((a: number, r: any) => a + (r.row_count_admitted ?? 0), 0);
    const rowsOut = (sheetsOut.data ?? []).reduce((a: number, r: any) => a + (r.row_count ?? 0), 0);
    const fromOwn = (sheetsOut.data ?? []).reduce((a: number, r: any) => a + (r.from_own_sourcing ?? 0), 0);
    results.push({
      id: c.id, display_name: c.display_name, email: c.email,
      is_admin: c.is_admin, is_approved: c.is_approved, last_active_at: c.last_active_at,
      uploaded_rows: uploadedRows,
      sheets_pulled: (sheetsOut.data ?? []).length,
      rows_out: rowsOut,
      pct_own: rowsOut > 0 ? `${Math.round((fromOwn / rowsOut) * 100)}%` : '—',
    });
  }
  return results;
}
