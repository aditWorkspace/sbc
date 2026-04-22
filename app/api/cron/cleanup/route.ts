import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { supabaseService } from '@/lib/supabase/service';
import { deleteSheet } from '@/lib/google/sheets';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supa = supabaseService();

  const { data: tokenData } = await supa.rpc('vault_read_secret', {
    secret_name: 'google_oauth_refresh_token',
  });
  const refreshToken = tokenData as unknown as string | null;
  if (!refreshToken) {
    return NextResponse.json({ ok: false, error: 'no_google_token' }, { status: 200 });
  }

  const { data: sheets } = await supa.from('sheets')
    .select('id, google_sheet_id')
    .lt('scheduled_delete_at', new Date().toISOString())
    .is('deleted_at', null)
    .not('google_sheet_id', 'is', null);

  let deleted = 0;
  for (const s of (sheets ?? [])) {
    try {
      await deleteSheet(s.google_sheet_id!, refreshToken);
      await supa.from('sheets').update({
        deleted_at: new Date().toISOString(), status: 'deleted',
      }).eq('id', s.id);
      deleted++;
    } catch {
      // try again next run
    }
  }
  return NextResponse.json({ ok: true, deleted });
}
