import { NextResponse } from 'next/server';
import { requireApprovedConsultant } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';
import { createSheetForConsultant, retryWithBackoff } from '@/lib/google/sheets';

const DEFAULT_MAX_ROWS = 300;
export const maxDuration = 60;

export async function POST() {
  const auth = await requireApprovedConsultant();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  }

  const supa = supabaseService();
  const { data: rows, error } = await supa.rpc('pull_sheet', {
    p_consultant_id: auth.consultant.id,
    p_max_rows: DEFAULT_MAX_ROWS,
  });
  if (error) {
    return NextResponse.json({ error: 'pull_failed', detail: error.message }, { status: 500 });
  }
  const rowArr = (rows ?? []) as Array<{
    id: string; first_name: string; last_name: string | null;
    company_display: string; email: string | null;
    uploaded_by: string; normalized_key: string;
  }>;
  if (rowArr.length === 0) {
    return NextResponse.json({ error: 'pool_empty' }, { status: 409 });
  }

  const fromOwn = rowArr.filter(r => r.uploaded_by === auth.consultant.id).length;
  const { data: sheetInsert, error: sheetErr } = await supa.from('sheets').insert({
    consultant_id: auth.consultant.id,
    row_count: rowArr.length,
    from_own_sourcing: fromOwn,
    from_shared_pool: rowArr.length - fromOwn,
  }).select('id').single();
  if (sheetErr || !sheetInsert) {
    return NextResponse.json({ error: 'sheet_record_failed', detail: sheetErr?.message }, { status: 500 });
  }
  const sheetDbId = sheetInsert.id;

  // Link archive rows we just created to this sheet (for audit)
  await supa.from('dedup_archive')
    .update({ pulled_in_sheet: sheetDbId })
    .in('normalized_key', rowArr.map(r => r.normalized_key))
    .is('pulled_in_sheet', null);

  // Get admin's Google refresh token from Vault
  const { data: tokenData, error: tokenErr } = await supa.rpc('vault_read_secret', {
    secret_name: 'google_oauth_refresh_token',
  });
  if (tokenErr || !tokenData) {
    await supa.from('sheets').update({ status: 'fallback_csv' }).eq('id', sheetDbId);
    return fallbackCsv(rowArr);
  }
  const refreshToken = tokenData as unknown as string;

  try {
    const sheet = await retryWithBackoff(() => createSheetForConsultant({
      consultant: { email: auth.consultant.email, display_name: auth.consultant.display_name },
      rows: rowArr.map(r => ({
        full_name: `${r.first_name} ${r.last_name ?? ''}`.trim(),
        first_name: r.first_name,
        company_display: r.company_display,
        email: r.email ?? '',
      })),
      refreshToken,
    }));

    await supa.from('sheets').update({
      google_sheet_id: sheet.id, google_sheet_url: sheet.url,
    }).eq('id', sheetDbId);

    return NextResponse.json({
      url: sheet.url,
      row_count: rowArr.length,
      warning: rowArr.length < DEFAULT_MAX_ROWS
        ? `Only ${rowArr.length} rows available (pool running low).`
        : null,
    });
  } catch {
    await supa.from('sheets').update({ status: 'fallback_csv' }).eq('id', sheetDbId);
    return fallbackCsv(rowArr);
  }
}

function fallbackCsv(rows: Array<{ first_name: string; last_name: string | null; company_display: string; email: string | null }>): Response {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [
    'Full Name,First Name,Company,Email',
    ...rows.map(r => [
      `${r.first_name} ${r.last_name ?? ''}`.trim(),
      r.first_name,
      r.company_display,
      r.email ?? '',
    ].map(esc).join(',')),
  ].join('\n');
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv',
      'content-disposition': `attachment; filename=sbc-sourcing-${Date.now()}.csv`,
      'x-fallback-reason': 'google_api_failed',
    },
  });
}
