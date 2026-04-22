import { supabaseService } from '@/lib/supabase/service';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeletePoolRowButton } from '@/components/delete-pool-row-button';

export const dynamic = 'force-dynamic';

export default async function PoolTab({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? '').trim();
  const supa = supabaseService();

  let query = supa.from('contacts').select('*').order('created_at', { ascending: false }).limit(100);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,company_display.ilike.%${q}%`);
  const { data: rows } = await query;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pool admin</h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name or company"
               className="border rounded px-3 py-2 text-sm flex-1 max-w-md bg-background" />
        <button type="submit" className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground">Search</button>
      </form>
      <Card>
        <CardHeader><CardTitle>Active pool ({rows?.length ?? 0} shown, max 100)</CardTitle></CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
