import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApprovedConsultant } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';
import { parseCsv } from '@/lib/csv/parse';
import { mapColumnsByAlias } from '@/lib/csv/map-columns';
import { mapColumnsLlm } from '@/lib/llm/tasks/column-mapping';
import { parseNamesLlm } from '@/lib/llm/tasks/name-parsing';
import { ingestUpload } from '@/lib/uploads/ingest';

const BodySchema = z.object({
  filename: z.string().max(255).optional(),
  csv: z.string().min(1).max(10 * 1024 * 1024),
  columnMap: z.object({
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    company: z.string(),
  }).optional(),
});

export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireApprovedConsultant();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  }

  const body = await req.json().catch(() => null);
  const parseResult = BodySchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: 'invalid_body', detail: parseResult.error.format() }, { status: 400 });
  }
  const { csv, filename, columnMap: overrideMap } = parseResult.data;

  const parsed = parseCsv(csv);
  if (!parsed.headers.length || !parsed.rows.length) {
    return NextResponse.json({ error: 'empty_csv' }, { status: 422 });
  }

  // Column mapping: Tier 1 alias -> Tier 2 LLM -> Tier 3 manual (422 back to client)
  let map: { first_name: string | null; last_name: string | null; company: string | null; unresolved: ('first_name'|'last_name'|'company')[] };
  if (overrideMap) {
    map = { first_name: overrideMap.first_name, last_name: overrideMap.last_name, company: overrideMap.company, unresolved: [] };
  } else {
    map = mapColumnsByAlias(parsed.headers);
    if (map.unresolved.includes('company') || map.unresolved.includes('first_name')) {
      const llm = await mapColumnsLlm(
        parsed.headers,
        parsed.rows.slice(0, 3).map(r => parsed.headers.map(h => r[h] ?? '')),
      );
      if (llm) map = { first_name: llm.first_name, last_name: llm.last_name, company: llm.company, unresolved: [] };
    }
  }
  if (!map.company || !map.first_name) {
    return NextResponse.json({
      error: 'column_mapping_failed',
      headers: parsed.headers,
      sample_rows: parsed.rows.slice(0, 3),
    }, { status: 422 });
  }

  const raw = parsed.rows.map(r => ({
    first_name: r[map.first_name!] ?? '',
    last_name: map.last_name ? (r[map.last_name] ?? undefined) : undefined,
    company: r[map.company!] ?? '',
  }));

  // If last_name wasn't mapped, try LLM-parsing first batch of full names
  if (!map.last_name && raw.length) {
    const firstBatch = raw.slice(0, 50).map(r => r.first_name);
    const parsedNames = await parseNamesLlm(firstBatch);
    if (parsedNames) {
      for (let i = 0; i < parsedNames.length; i++) {
        raw[i]!.first_name = parsedNames[i]!.first;
        raw[i]!.last_name = parsedNames[i]!.last;
      }
    }
  }

  const result = await ingestUpload(supabaseService(), auth.consultant.id, filename ?? null, raw);
  return NextResponse.json(result);
}
