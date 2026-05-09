import { supabaseService } from '@/lib/supabase/service';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DeletePoolRowButton } from '@/components/delete-pool-row-button';
import { BulkDeleteButton } from '@/components/bulk-delete-button';

export const dynamic = 'force-dynamic';

export default async function PoolTab({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? '').trim();
  const supa = supabaseService();

  // Active row search
  let query = supa.from('contacts').select('*').order('created_at', { ascending: false }).limit(100);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,company_display.ilike.%${q}%`);
  const { data: rows } = await query;

  // Group A: contacts grouped by upload (batch). Most recent uploads first.
  const { data: contactsForUploads } = await supa
    .from('contacts')
    .select('upload_id, enrichment_status')
    .limit(5000);
  const byUpload = new Map<string, { pending: number; enriched: number; total: number }>();
  for (const c of contactsForUploads ?? []) {
    const k = (c as any).upload_id;
    const e = byUpload.get(k) ?? { pending: 0, enriched: 0, total: 0 };
    if ((c as any).enrichment_status === 'pending') e.pending++;
    else if ((c as any).enrichment_status === 'enriched') e.enriched++;
    e.total++;
    byUpload.set(k, e);
  }
  const uploadIds = [...byUpload.keys()];
  const { data: uploadRows } = uploadIds.length
    ? await supa.from('uploads')
        .select('id, filename, uploaded_at, consultant_id, row_count_raw, row_count_admitted, status')
        .in('id', uploadIds).order('uploaded_at', { ascending: false })
    : { data: [] };
  const consultantIds = [...new Set((uploadRows ?? []).map((u: any) => u.consultant_id))];
  const { data: consultantRows } = consultantIds.length
    ? await supa.from('consultants').select('id, email, display_name').in('id', consultantIds)
    : { data: [] };
  const consultantById = new Map((consultantRows ?? []).map(c => [(c as any).id, c as any]));

  // Group B: contacts grouped by company.
  const { data: contactsForCompanies } = await supa
    .from('contacts')
    .select('company_id, enrichment_status')
    .limit(5000);
  const byCompany = new Map<string, { pending: number; enriched: number; total: number }>();
  for (const c of contactsForCompanies ?? []) {
    const k = (c as any).company_id;
    const e = byCompany.get(k) ?? { pending: 0, enriched: 0, total: 0 };
    if ((c as any).enrichment_status === 'pending') e.pending++;
    else if ((c as any).enrichment_status === 'enriched') e.enriched++;
    e.total++;
    byCompany.set(k, e);
  }
  const companyIds = [...byCompany.keys()];
  const { data: companyRows } = companyIds.length
    ? await supa.from('companies')
        .select('id, display_name, name_normalized, template_confidence, template_pattern, domain, sample_size, matching_samples, apollo_credits_spent')
        .in('id', companyIds)
    : { data: [] };
  const sortedCompanies = (companyRows ?? []).sort((a: any, b: any) => {
    const aTotal = byCompany.get(a.id)?.total ?? 0;
    const bTotal = byCompany.get(b.id)?.total ?? 0;
    return bTotal - aTotal;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pool admin</h1>

      <p className="text-sm text-muted-foreground">
        Bulk-delete removes contacts from the pool but <strong>keeps Icypeas samples
        and learned templates</strong>, so future uploads of the same companies skip
        re-paying for credits.
      </p>

      {/* ── Bulk delete by upload (batch) ─────────────── */}
      <Card>
        <CardHeader><CardTitle>Delete by batch (upload)</CardTitle></CardHeader>
        <CardContent>
          {uploadRows && uploadRows.length ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead>
                <TableHead>File</TableHead>
                <TableHead>PM</TableHead>
                <TableHead className="text-right">In pool</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Enriched</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {uploadRows.map((u: any) => {
                  const stats = byUpload.get(u.id) ?? { pending: 0, enriched: 0, total: 0 };
                  const c = consultantById.get(u.consultant_id);
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="text-xs">{new Date(u.uploaded_at).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{u.filename ?? '—'}</TableCell>
                      <TableCell className="text-xs">{c?.display_name ?? c?.email ?? '—'}</TableCell>
                      <TableCell className="text-right">{stats.total}</TableCell>
                      <TableCell className="text-right">{stats.pending}</TableCell>
                      <TableCell className="text-right">{stats.enriched}</TableCell>
                      <TableCell className="text-right">
                        <BulkDeleteButton
                          kind="upload"
                          id={u.id}
                          label={`upload ${u.filename ?? u.id.slice(0, 8)}`}
                          count={stats.total}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No active uploads with contacts in the pool.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Bulk delete by company ─────────────── */}
      <Card>
        <CardHeader><CardTitle>Delete by company</CardTitle></CardHeader>
        <CardContent>
          {sortedCompanies.length ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Template</TableHead>
                <TableHead className="text-right">In pool</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Enriched</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sortedCompanies.map((co: any) => {
                  const stats = byCompany.get(co.id) ?? { pending: 0, enriched: 0, total: 0 };
                  return (
                    <TableRow key={co.id}>
                      <TableCell>{co.display_name}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="font-mono">{co.template_confidence}</Badge>
                        {co.template_pattern && co.domain ? (
                          <span className="ml-2 text-muted-foreground">
                            {co.template_pattern} @ {co.domain} ({co.matching_samples}/{co.sample_size})
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">{stats.total}</TableCell>
                      <TableCell className="text-right">{stats.pending}</TableCell>
                      <TableCell className="text-right">{stats.enriched}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{co.apollo_credits_spent}</TableCell>
                      <TableCell className="text-right">
                        <BulkDeleteButton
                          kind="company"
                          id={co.id}
                          label={`all "${co.display_name}" contacts`}
                          count={stats.total}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No companies in the pool.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Single-row search (existing) ─────────────── */}
      <Card>
        <CardHeader><CardTitle>Search & delete a single row</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Search name or company"
                   className="border rounded px-3 py-2 text-sm flex-1 max-w-md bg-background" />
            <button type="submit" className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground">Search</button>
          </form>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(rows ?? []).map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.first_name} {r.last_name ?? ''}</TableCell>
                  <TableCell>{r.company_display}</TableCell>
                  <TableCell className="font-mono text-xs">{r.email ?? '—'}</TableCell>
                  <TableCell>{r.enrichment_status}</TableCell>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <DeletePoolRowButton contactId={r.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            Showing up to 100 rows {q ? `matching "${q}"` : 'most recent first'}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
