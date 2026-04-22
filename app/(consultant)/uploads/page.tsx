import { supabaseServer } from '@/lib/supabase/server';
import { currentConsultant } from '@/lib/auth/current';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Uploads() {
  const c = await currentConsultant();
  if (!c) redirect('/sign-in');
  const { data: uploads } = await supabaseServer()
    .from('uploads').select('*')
    .eq('consultant_id', c.id)
    .order('uploaded_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Your uploads</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>File</TableHead>
            <TableHead className="text-right">Raw</TableHead>
            <TableHead className="text-right">Admitted</TableHead>
            <TableHead className="text-right">Rejected</TableHead>
            <TableHead className="text-right">Already in pool</TableHead>
            <TableHead className="text-right">Prev. emailed</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(uploads ?? []).map(u => (
            <TableRow key={u.id}>
              <TableCell className="whitespace-nowrap">{new Date(u.uploaded_at).toLocaleString()}</TableCell>
              <TableCell>{u.filename ?? '—'}</TableCell>
              <TableCell className="text-right">{u.row_count_raw}</TableCell>
              <TableCell className="text-right">{u.row_count_admitted}</TableCell>
              <TableCell className="text-right">{u.row_count_rejected}</TableCell>
              <TableCell className="text-right">{u.row_count_already_in_pool}</TableCell>
              <TableCell className="text-right">{u.row_count_archived}</TableCell>
              <TableCell>{u.status}</TableCell>
            </TableRow>
          ))}
          {(uploads ?? []).length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No uploads yet.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
