import { supabaseServer } from '@/lib/supabase/server';
import { currentConsultant } from '@/lib/auth/current';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Sheets() {
  const c = await currentConsultant();
  if (!c) redirect('/sign-in');
  const { data: sheets } = await supabaseServer()
    .from('sheets').select('*')
    .eq('consultant_id', c.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Your sheets</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="text-right">From own</TableHead>
            <TableHead className="text-right">From shared</TableHead>
            <TableHead>Link</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(sheets ?? []).map(s => (
            <TableRow key={s.id}>
              <TableCell className="whitespace-nowrap">{new Date(s.created_at).toLocaleString()}</TableCell>
              <TableCell className="text-right">{s.row_count}</TableCell>
              <TableCell className="text-right">{s.from_own_sourcing}</TableCell>
              <TableCell className="text-right">{s.from_shared_pool}</TableCell>
              <TableCell>
                {s.google_sheet_url && s.status === 'active'
                  ? <a href={s.google_sheet_url} target="_blank" rel="noreferrer" className="text-primary underline">Open</a>
                  : <span className="text-muted-foreground text-sm">{s.status}</span>}
              </TableCell>
              <TableCell>{s.status}</TableCell>
            </TableRow>
          ))}
          {(sheets ?? []).length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No sheets yet.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
