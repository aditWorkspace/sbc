import { supabaseService } from '@/lib/supabase/service';
import { notFound } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConsultantActions } from '@/components/consultant-actions';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function ConsultantDrilldown({ params }: { params: { id: string } }) {
  const supa = supabaseService();
  const { data: c } = await supa.from('consultants').select('*').eq('id', params.id).single();
  if (!c) return notFound();
  const [{ data: uploads }, { data: sheets }] = await Promise.all([
    supa.from('uploads').select('*').eq('consultant_id', c.id).order('uploaded_at', { ascending: false }),
    supa.from('sheets').select('*').eq('consultant_id', c.id).order('created_at', { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{c.display_name ?? c.email}</h1>
          <p className="text-sm text-muted-foreground">{c.email}</p>
          <div className="flex gap-1 mt-2">
            {c.deactivated_at ? <Badge variant="destructive">deactivated</Badge>
              : c.is_approved ? <Badge variant="secondary">approved</Badge>
              : <Badge variant="outline">pending</Badge>}
            {c.is_admin && <Badge>admin</Badge>}
          </div>
        </div>
        <ConsultantActions id={c.id} isApproved={c.is_approved}
          isAdmin={c.is_admin} isDeactivated={!!c.deactivated_at} />
      </div>
      <Card>
        <CardHeader><CardTitle>Uploads ({uploads?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>File</TableHead>
              <TableHead className="text-right">Raw</TableHead>
              <TableHead className="text-right">Admitted</TableHead>
              <TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(uploads ?? []).map(u => (
                <TableRow key={u.id}>
                  <TableCell>{new Date(u.uploaded_at).toLocaleString()}</TableCell>
                  <TableCell>{u.filename ?? '—'}</TableCell>
                  <TableCell className="text-right">{u.row_count_raw}</TableCell>
                  <TableCell className="text-right">{u.row_count_admitted}</TableCell>
                  <TableCell>{u.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Sheets ({sheets?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">From own</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(sheets ?? []).map(s => (
                <TableRow key={s.id}>
                  <TableCell>{new Date(s.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{s.row_count}</TableCell>
                  <TableCell className="text-right">{s.from_own_sourcing}</TableCell>
                  <TableCell>{s.google_sheet_url && s.status === 'active'
                    ? <a href={s.google_sheet_url} target="_blank" rel="noreferrer" className="text-primary underline">Open</a>
                    : <span className="text-muted-foreground text-sm">—</span>}</TableCell>
                  <TableCell>{s.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
