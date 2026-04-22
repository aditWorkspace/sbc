import { supabaseService } from '@/lib/supabase/service';
import { currentConsultant } from '@/lib/auth/current';
import { notFound } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConsultantActions } from '@/components/consultant-actions';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

function RoleBadge({ role }: { role: string }) {
  if (role === 'owner') {
    return <Badge className="bg-emerald-600 text-white border-emerald-600">OWNER</Badge>;
  }
  if (role === 'admin') {
    return <Badge variant="outline" className="border-emerald-500 text-emerald-600">ADMIN</Badge>;
  }
  if (role === 'jr_consultant') {
    return <Badge variant="outline" className="border-yellow-500 text-yellow-600">JR CONSULTANT</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">CONSULTANT</Badge>;
}

export default async function ConsultantDrilldown({ params }: { params: { id: string } }) {
  const supa = supabaseService();
  const [c_result, viewer, uploads_result, sheets_result] = await Promise.all([
    supa.from('consultants').select('*').eq('id', params.id).single(),
    currentConsultant(),
    supa.from('uploads').select('*').eq('consultant_id', params.id).order('uploaded_at', { ascending: false }),
    supa.from('sheets').select('*').eq('consultant_id', params.id).order('created_at', { ascending: false }),
  ]);

  const c = c_result.data;
  if (!c) return notFound();

  const uploads = uploads_result.data;
  const sheets = sheets_result.data;

  const viewerRole = (viewer?.role === 'owner' ? 'owner' : 'admin') as 'owner' | 'admin';
  const viewerId = viewer?.id ?? '';

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
            <RoleBadge role={c.role ?? 'consultant'} />
          </div>
        </div>
        <ConsultantActions
          id={c.id}
          isApproved={c.is_approved}
          isAdmin={c.is_admin}
          isDeactivated={!!c.deactivated_at}
          currentRole={(c.role ?? 'consultant') as 'owner' | 'admin' | 'consultant' | 'jr_consultant'}
          viewerRole={viewerRole}
          viewerId={viewerId}
        />
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
