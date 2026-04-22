import { supabaseService } from '@/lib/supabase/service';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ForceRefreshButton } from '@/components/force-refresh-button';

export const dynamic = 'force-dynamic';

const CONF_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  HIGH: 'default', MEDIUM: 'secondary', LOW: 'outline',
  UNRESOLVED: 'destructive', SAMPLING: 'outline', UNKNOWN: 'outline',
};

export default async function TemplatesTab() {
  const supa = supabaseService();
  const { data: companies } = await supa.from('companies')
    .select('*').order('updated_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Templates</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Pattern</TableHead>
            <TableHead>Domain</TableHead>
            <TableHead className="text-right">Samples</TableHead>
            <TableHead className="text-right">Match</TableHead>
            <TableHead className="text-right">Credits</TableHead>
            <TableHead>Locked</TableHead>
            <TableHead className="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(companies ?? []).map(c => (
            <TableRow key={c.id}>
              <TableCell>{c.display_name}</TableCell>
              <TableCell>
                <Badge variant={CONF_VARIANT[c.template_confidence] ?? 'outline'}>
                  {c.template_confidence}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{c.template_pattern ?? '—'}</TableCell>
              <TableCell className="font-mono text-xs">{c.domain ?? '—'}</TableCell>
              <TableCell className="text-right">{c.sample_size}</TableCell>
              <TableCell className="text-right">{c.matching_samples}</TableCell>
              <TableCell className="text-right">{c.apollo_credits_spent}</TableCell>
              <TableCell className="text-xs">{c.locked_at ? new Date(c.locked_at).toLocaleDateString() : '—'}</TableCell>
              <TableCell className="text-right">
                <ForceRefreshButton companyId={c.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
