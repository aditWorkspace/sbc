import { UploadZone } from '@/components/upload-zone';
import { GetSheetButton } from '@/components/get-sheet-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { currentConsultant } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const c = await currentConsultant();
  if (!c) redirect('/sign-in');

  const supa = supabaseService();
  const [poolRes, uploadsRes, sheetsRes, recentUploadsRes, recentSheetsRes] = await Promise.all([
    supa.from('contacts').select('*', { count: 'exact', head: true }),
    supa.from('uploads').select('row_count_admitted').eq('consultant_id', c.id),
    supa.from('sheets').select('row_count').eq('consultant_id', c.id),
    supa.from('uploads')
      .select('id, uploaded_at, filename, row_count_raw, row_count_admitted, status')
      .eq('consultant_id', c.id)
      .order('uploaded_at', { ascending: false })
      .limit(3),
    supa.from('sheets')
      .select('id, created_at, row_count, google_sheet_url, status')
      .eq('consultant_id', c.id)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const poolTotal = poolRes.count ?? 0;
  const myUploaded = (uploadsRes.data ?? []).reduce((a: number, r: { row_count_admitted: number }) => a + (r.row_count_admitted ?? 0), 0);
  const mySent = (sheetsRes.data ?? []).reduce((a: number, r: { row_count: number }) => a + (r.row_count ?? 0), 0);
  const underwater = mySent > myUploaded;

  const recentUploads = recentUploadsRes.data ?? [];
  const recentSheets = recentSheetsRes.data ?? [];

  return (
    <div className="space-y-6">
      {underwater && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-foreground">
          <p className="font-semibold text-destructive">You&apos;ve sent more than you&apos;ve sourced.</p>
          <p className="mt-1 text-muted-foreground">
            You&apos;ve emailed <strong className="text-foreground">{mySent.toLocaleString()}</strong> people but only uploaded{' '}
            <strong className="text-foreground">{myUploaded.toLocaleString()}</strong> to the shared pool. You&apos;re eating into
            your teammates&apos; uploads — please upload more contacts to balance it out.
          </p>
        </div>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="font-mono text-[11px] uppercase tracking-[1.2px] text-muted-foreground">Pool total</div>
            <div className="text-2xl font-semibold mt-1">{poolTotal.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">rows available club-wide</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="font-mono text-[11px] uppercase tracking-[1.2px] text-muted-foreground">You uploaded</div>
            <div className="text-2xl font-semibold mt-1">{myUploaded.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">rows admitted from your CSVs</div>
          </CardContent>
        </Card>
        <Card className={`border-border ${underwater ? 'border-destructive/40' : ''}`} style={{ backgroundColor: 'hsl(var(--card))' }}>
          <CardContent className="p-4">
            <div className="font-mono text-[11px] uppercase tracking-[1.2px] text-muted-foreground">You sent</div>
            <div className={`text-2xl font-semibold mt-1 ${underwater ? 'text-destructive' : ''}`}>
              {mySent.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              rows pulled into your sheets
              {underwater && (
                <> — <span className="text-destructive font-medium">{mySent - myUploaded} over!</span></>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Upload contacts ───────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-medium">Upload contacts</CardTitle>
        </CardHeader>
        <CardContent><UploadZone /></CardContent>
      </Card>

      {/* Recent uploads sub-section */}
      {recentUploads.length > 0 && (
        <div className="space-y-2 -mt-2 px-1">
          <p className="font-mono text-[11px] uppercase tracking-[1.2px] text-muted-foreground">Recent uploads</p>
          <div className="space-y-1.5">
            {recentUploads.map(u => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-muted-foreground text-xs font-mono shrink-0">
                    {new Date(u.uploaded_at).toLocaleDateString()}
                  </span>
                  <span className="truncate text-foreground">{u.filename ?? '(no name)'}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground font-mono">
                    {u.row_count_raw} raw / <span className="text-foreground">{u.row_count_admitted} admitted</span>
                  </span>
                  <span className={[
                    'font-mono text-[10px] uppercase tracking-[1.2px] px-2 py-0.5 rounded-full border',
                    u.status === 'done'
                      ? 'text-primary border-primary/30 bg-primary/5'
                      : 'text-muted-foreground border-border',
                  ].join(' ')}>
                    {u.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/history"
            className="text-xs text-primary hover:underline font-mono tracking-wide"
          >
            See all uploads →
          </Link>
        </div>
      )}

      {/* ── Get a sheet ──────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-medium">Get a sheet</CardTitle>
        </CardHeader>
        <CardContent><GetSheetButton /></CardContent>
      </Card>

      {/* Recent sheets sub-section */}
      {recentSheets.length > 0 && (
        <div className="space-y-2 -mt-2 px-1">
          <p className="font-mono text-[11px] uppercase tracking-[1.2px] text-muted-foreground">Recent sheets</p>
          <div className="space-y-1.5">
            {recentSheets.map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-muted-foreground text-xs font-mono shrink-0">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-muted-foreground text-xs font-mono">
                    <span className="text-foreground">{s.row_count}</span> rows
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {s.google_sheet_url && s.status === 'active' ? (
                    <a
                      href={s.google_sheet_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline text-xs font-mono"
                    >
                      Open sheet
                    </a>
                  ) : null}
                  <span className={[
                    'font-mono text-[10px] uppercase tracking-[1.2px] px-2 py-0.5 rounded-full border',
                    s.status === 'active'
                      ? 'text-primary border-primary/30 bg-primary/5'
                      : 'text-muted-foreground border-border',
                  ].join(' ')}>
                    {s.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/history"
            className="text-xs text-primary hover:underline font-mono tracking-wide"
          >
            See all sheets →
          </Link>
        </div>
      )}
    </div>
  );
}
