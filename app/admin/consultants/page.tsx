import { supabaseService } from '@/lib/supabase/service';
import { currentConsultant } from '@/lib/auth/current';
import { AddConsultantForm } from '@/components/add-consultant-form';
import { ConsultantActions } from '@/components/consultant-actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function RoleBadge({ role }: { role: string }) {
  if (role === 'owner') {
    return <Badge className="bg-emerald-600 text-white border-emerald-600">OWNER</Badge>;
  }
  if (role === 'admin') {
    return <Badge variant="outline" className="border-emerald-500 text-emerald-600">ADMIN</Badge>;
  }
  if (role === 'jr_consultant') {
    return <Badge variant="outline" className="border-yellow-500 text-yellow-600">JR</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">CONSULTANT</Badge>;
}

export default async function ConsultantsTab() {
  const supa = supabaseService();
  const [viewer, { data: all }] = await Promise.all([
    currentConsultant(),
    supa.from('consultants').select('*').order('created_at', { ascending: false }),
  ]);

  const viewerRole = (viewer?.role === 'owner' ? 'owner' : 'admin') as 'owner' | 'admin';
  const viewerId = viewer?.id ?? '';

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
                <TableHead>Role</TableHead>
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
                  <TableCell>
                    <RoleBadge role={c.role ?? 'consultant'} />
                  </TableCell>
                  <TableCell className="space-x-1">
                    {c.deactivated_at ? <Badge variant="destructive">deactivated</Badge>
                      : c.is_approved ? <Badge variant="secondary">approved</Badge>
                      : <Badge variant="outline">pending</Badge>}
                  </TableCell>
                  <TableCell>{c.last_active_at ? new Date(c.last_active_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell className="text-right">
                    <ConsultantActions
                      id={c.id}
                      isApproved={c.is_approved}
                      isAdmin={c.is_admin}
                      isDeactivated={!!c.deactivated_at}
                      currentRole={(c.role ?? 'consultant') as 'owner' | 'admin' | 'consultant' | 'jr_consultant'}
                      viewerRole={viewerRole}
                      viewerId={viewerId}
                    />
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
