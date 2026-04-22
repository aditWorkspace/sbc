import { supabaseService } from '@/lib/supabase/service';
import { overviewKpis, perConsultantActivity, type Range } from '@/lib/admin/queries';
import { KpiCard } from '@/components/kpi-card';
import { TimeRangeToggle } from '@/components/time-range-toggle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminOverview({ searchParams }: { searchParams: { range?: string } }) {
  const range = (['day','week','month','all'].includes(searchParams.range ?? '') ? searchParams.range : 'month') as Range;
  const supa = supabaseService();
  const kpis = await overviewKpis(supa, range);
  const consultants = await perConsultantActivity(supa, range);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Overview</h1>
        <TimeRangeToggle current={range} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Active pool" value={kpis.pool.toLocaleString()} sub="rows available" />
        <KpiCard label={`Uploaded (${range})`} value={kpis.uploadedRows.toLocaleString()} />
        <KpiCard label={`Sheets (${range})`} value={String(kpis.sheetCount)} sub={`${kpis.sheetRows.toLocaleString()} rows out`} />
        <KpiCard label={`Apollo credits (${range})`} value={String(kpis.credits)} sub="1 credit ≈ 1 email" />
      </div>

      <Card>
        <CardHeader><CardTitle>Consultant activity</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Consultant</TableHead>
                <TableHead className="text-right">Uploaded</TableHead>
                <TableHead className="text-right">Sheets</TableHead>
                <TableHead className="text-right">Rows out</TableHead>
                <TableHead className="text-right">% own</TableHead>
                <TableHead>Last active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consultants.map(c => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/admin/consultants/${c.id}`} className="hover:underline">
                      {c.display_name ?? c.email}
                    </Link>
                    {c.is_admin && <Badge variant="secondary" className="ml-2">admin</Badge>}
                    {!c.is_approved && <Badge variant="outline" className="ml-2">pending</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{c.uploaded_rows}</TableCell>
                  <TableCell className="text-right">{c.sheets_pulled}</TableCell>
                  <TableCell className="text-right">{c.rows_out}</TableCell>
                  <TableCell className="text-right">{c.pct_own}</TableCell>
                  <TableCell>{c.last_active_at ? new Date(c.last_active_at).toLocaleDateString() : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Template cache</CardTitle></CardHeader>
          <CardContent>
            <dl className="text-sm space-y-1">
              {Object.entries(kpis.confidenceBreakdown).map(([conf, n]) => (
                <div key={conf} className="flex justify-between"><dt>{conf}</dt><dd>{n}</dd></div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top companies (pool)</CardTitle></CardHeader>
          <CardContent>
            <dl className="text-sm space-y-1">
              {kpis.topCompanies.map(c => (
                <div key={c.name} className="flex justify-between"><dt>{c.name}</dt><dd>{c.count}</dd></div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
