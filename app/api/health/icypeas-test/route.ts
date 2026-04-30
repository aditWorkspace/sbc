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

  const cases = [
    { first_name: 'Sundar', last_name: 'Pichai', organization_name: 'google.com' },
    { first_name: 'Tim',    last_name: 'Cook',   organization_name: 'apple.com'  },
    { first_name: 'Emily',  last_name: 'Baum',   organization_name: 'KCC' },
    { first_name: 'Forest', last_name: 'Himmelfarb', organization_name: 'Meta' },
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
