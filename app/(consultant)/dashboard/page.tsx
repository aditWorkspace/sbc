import { UploadZone } from '@/components/upload-zone';
import { GetSheetButton } from '@/components/get-sheet-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { currentConsultant } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const c = await currentConsultant();
  if (!c) redirect('/sign-in');

  const supa = supabaseService();
  const [poolRes, uploadsRes, sheetsRes] = await Promise.all([
    supa.from('contacts').select('*', { count: 'exact', head: true }),
    supa.from('uploads').select('row_count_admitted').eq('consultant_id', c.id),
    supa.from('sheets').select('row_count').eq('consultant_id', c.id),
  ]);
  const poolTotal = poolRes.count ?? 0;
  const myUploaded = (uploadsRes.data ?? []).reduce((a: number, r: { row_count_admitted: number }) => a + (r.row_count_admitted ?? 0), 0);
  const mySent = (sheetsRes.data ?? []).reduce((a: number, r: { row_count: number }) => a + (r.row_count ?? 0), 0);
  const underwater = mySent > myUploaded;

  return (
    <div className="space-y-6">
      {underwater && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">You&apos;ve sent more than you&apos;ve sourced.</p>
          <p>
            You&apos;ve emailed <strong>{mySent.toLocaleString()}</strong> people but only uploaded{' '}
            <strong>{myUploaded.toLocaleString()}</strong> to the shared pool. You&apos;re eating into
            your teammates&apos; uploads — please upload more contacts to balance it out.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Pool total</div>
          <div className="text-2xl font-semibold mt-1">{poolTotal.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">rows available club-wide</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground">You uploaded</div>
          <div className="text-2xl font-semibold mt-1">{myUploaded.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">rows admitted from your CSVs</div>
        </CardContent></Card>
        <Card><CardContent className={`p-4 ${underwater ? 'bg-red-50' : ''}`}>
          <div className="text-xs uppercase text-muted-foreground">You sent</div>
          <div className={`text-2xl font-semibold mt-1 ${underwater ? 'text-red-700' : ''}`}>
            {mySent.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            rows pulled into your sheets
            {underwater && (
              <> — <span className="text-red-700 font-medium">{mySent - myUploaded} over!</span></>
            )}
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Upload contacts</CardTitle></CardHeader>
        <CardContent><UploadZone /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Get a sheet</CardTitle></CardHeader>
        <CardContent><GetSheetButton /></CardContent>
      </Card>
    </div>
  );
}
