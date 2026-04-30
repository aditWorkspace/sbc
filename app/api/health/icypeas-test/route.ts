import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { icypeasBulkMatch } from '@/lib/icypeas/client';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// Diagnostic: hit Icypeas from this Vercel function with a known set of names
// and report timing + raw results. Auth-gated by CRON_SECRET so it can't be
// abused publicly.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Mode: ?mode=single does ONE submit + manual poll loop with raw timing.
  // Default does the bulk match (parallel submits + polls).
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') ?? 'bulk';

  // Mode read: poll a known id (passed via ?id=) and dump the raw body
  if (mode === 'read') {
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'need ?id=' }, { status: 400 });
    const t0 = Date.now();
    const res = await fetch('https://app.icypeas.com/api/bulk-single-searchs/read', {
      method: 'POST',
      headers: { 'Authorization': env().ICYPEAS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const body = await res.text();
    return NextResponse.json({ took_ms: Date.now() - t0, http: res.status, body: body.slice(0, 2000) });
  }

  if (mode === 'single') {
    const t0 = Date.now();
    const log: any[] = [];
    const submit = await fetch('https://app.icypeas.com/api/email-search', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Authorization': env().ICYPEAS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstname: 'Sundar', lastname: 'Pichai', domainOrCompany: 'google.com' }),
    });
    const submitBody = await submit.text();
    log.push({ step: 'submit', t_ms: Date.now() - t0, status: submit.status, body: submitBody.slice(0, 300) });
    const submitJson = JSON.parse(submitBody);
    const id = submitJson?.item?._id;
    if (!id) return NextResponse.json({ log, error: 'no id from submit' });

    // Manual poll up to 100s with 5s interval
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const read = await fetch('https://app.icypeas.com/api/bulk-single-searchs/read', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Authorization': env().ICYPEAS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const readBody = await read.text();
      const parsed = JSON.parse(readBody);
      const status = parsed?.items?.[0]?.status ?? '?';
      log.push({ step: `poll[${i}]`, t_ms: Date.now() - t0, http: read.status, status });
      if (!['NONE', 'SCHEDULED', 'IN_PROGRESS', '', '?'].includes(status)) {
        log.push({ step: 'terminal', emails: parsed?.items?.[0]?.results?.emails });
        break;
      }
    }
    return NextResponse.json({ took_ms: Date.now() - t0, log });
  }

  const cases = [
    { first_name: 'Sundar', last_name: 'Pichai', organization_name: 'google.com' },
    { first_name: 'Tim',    last_name: 'Cook',   organization_name: 'apple.com'  },
  ];

  const t0 = Date.now();
  try {
    const r = await icypeasBulkMatch(cases);
    const took = Date.now() - t0;
    return NextResponse.json({
      took_ms: took,
      api_key_length: env().ICYPEAS_API_KEY.length,
      api_key_prefix: env().ICYPEAS_API_KEY.slice(0, 8),
      matches: r.matches.map((m, i) => ({
        case: cases[i],
        status: m === undefined ? 'transient' : m === null ? 'null' : 'found',
        email: m && typeof m === 'object' ? m.email : null,
      })),
    });
  } catch (e) {
    return NextResponse.json({
      took_ms: Date.now() - t0,
      api_key_length: env().ICYPEAS_API_KEY.length,
      threw: (e as Error).message,
    });
  }
}
