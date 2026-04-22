import { supabaseService } from '@/lib/supabase/service';
import { AddConsultantForm } from '@/components/add-consultant-form';
import { ConsultantActions } from '@/components/consultant-actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ConsultantsTab() {
  const supa = supabaseService();
  const { data: all } = await supa.from('consultants')
    .select('*').order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Consultants</h1>
      <Card>
        <CardHeader><CardTitle>Add consultant</CardTitle></CardHeader>
        <CardContent><AddConsultantForm /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>All</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(all ?? []).map(c => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/admin/consultants/${c.id}`} className="hover:underline">{c.email}</Link>
                  </TableCell>
                  <TableCell>{c.display_name ?? '—'}</TableCell>
                  <TableCell className="space-x-1">
                    {c.deactivated_at ? <Badge variant="destructive">deactivated</Badge>
                      : c.is_approved ? <Badge variant="secondary">approved</Badge>
                      : <Badge variant="outline">pending</Badge>}
                    {c.is_admin && <Badge>admin</Badge>}
                  </TableCell>
                  <TableCell>{c.last_active_at ? new Date(c.last_active_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell className="text-right">
                    <ConsultantActions id={c.id} isApproved={c.is_approved}
                      isAdmin={c.is_admin} isDeactivated={!!c.deactivated_at} />
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
