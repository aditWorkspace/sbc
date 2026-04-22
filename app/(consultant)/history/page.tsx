import { supabaseServer } from '@/lib/supabase/server';
import { currentConsultant } from '@/lib/auth/current';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function History() {
  const c = await currentConsultant();
  if (!c) redirect('/sign-in');

  const supa = supabaseServer();
  const [uploadsRes, sheetsRes] = await Promise.all([
    supa.from('uploads').select('*').eq('consultant_id', c.id).order('uploaded_at', { ascending: false }),
    supa.from('sheets').select('*').eq('consultant_id', c.id).order('created_at', { ascending: false }),
  ]);

  const uploads = uploadsRes.data ?? [];
  const sheets = sheetsRes.data ?? [];

  return (
    <div className="space-y-10">
      {/* ── Uploads ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="font-mono text-xs font-medium uppercase tracking-[1.2px] text-muted-foreground">
          Your uploads
        </h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="font-mono text-[11px] uppercase tracking-[1.2px]">Date</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-[1.2px]">File</TableHead>
                <TableHead className="text-right font-mono text-[11px] uppercase tracking-[1.2px]">Raw</TableHead>
                <TableHead className="text-right font-mono text-[11px] uppercase tracking-[1.2px]">Admitted</TableHead>
                <TableHead className="text-right font-mono text-[11px] uppercase tracking-[1.2px]">Rejected</TableHead>
                <TableHead className="text-right font-mono text-[11px] uppercase tracking-[1.2px]">In pool</TableHead>
                <TableHead className="text-right font-mono text-[11px] uppercase tracking-[1.2px]">Prev. emailed</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-[1.2px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploads.map(u => (
                <TableRow key={u.id} className="border-border">
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(u.uploaded_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-sm">{u.filename ?? '—'}</TableCell>
                  <TableCell className="text-right text-sm">{u.row_count_raw}</TableCell>
                  <TableCell className="text-right text-sm">{u.row_count_admitted}</TableCell>
                  <TableCell className="text-right text-sm">{u.row_count_rejected}</TableCell>
                  <TableCell className="text-right text-sm">{u.row_count_already_in_pool}</TableCell>
                  <TableCell className="text-right text-sm">{u.row_count_archived}</TableCell>
                  <TableCell>
                    <span className={[
                      'font-mono text-[11px] uppercase tracking-[1.2px] px-2 py-0.5 rounded-full border',
                      u.status === 'done'
                        ? 'text-primary border-primary/30 bg-primary/5'
                        : 'text-muted-foreground border-border',
                    ].join(' ')}>
                      {u.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {uploads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-8">
                    No uploads yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ── Sheets ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="font-mono text-xs font-medium uppercase tracking-[1.2px] text-muted-foreground">
          Your sheets
        </h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="font-mono text-[11px] uppercase tracking-[1.2px]">Date</TableHead>
                <TableHead className="text-right font-mono text-[11px] uppercase tracking-[1.2px]">Rows</TableHead>
                <TableHead className="text-right font-mono text-[11px] uppercase tracking-[1.2px]">From own</TableHead>
                <TableHead className="text-right font-mono text-[11px] uppercase tracking-[1.2px]">From shared</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-[1.2px]">Link</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-[1.2px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheets.map(s => (
                <TableRow key={s.id} className="border-border">
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right text-sm">{s.row_count}</TableCell>
                  <TableCell className="text-right text-sm">{s.from_own_sourcing}</TableCell>
                  <TableCell className="text-right text-sm">{s.from_shared_pool}</TableCell>
                  <TableCell>
                    {s.google_sheet_url && s.status === 'active' ? (
                      <a
                        href={s.google_sheet_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline text-sm"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={[
                      'font-mono text-[11px] uppercase tracking-[1.2px] px-2 py-0.5 rounded-full border',
                      s.status === 'active'
                        ? 'text-primary border-primary/30 bg-primary/5'
                        : 'text-muted-foreground border-border',
                    ].join(' ')}>
                      {s.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {sheets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                    No sheets yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
