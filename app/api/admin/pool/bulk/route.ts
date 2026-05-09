import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';
import { audit } from '@/lib/security/audit';

// Bulk-delete contacts from the pool. apollo_samples and companies are
// PRESERVED so we don't lose template learning (we already paid the credits).
//
// Modes:
//   - upload:  delete all contacts with upload_id = X
//   - company: delete all contacts with company_id = X
//   - older_than: delete all contacts with created_at < ISO timestamp
//   - filter:  combo (consultant_id + company_id + before/after dates)

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('upload'),     upload_id: z.string().uuid() }),
  z.object({ kind: z.literal('company'),    company_id: z.string().uuid() }),
  z.object({ kind: z.literal('older_than'), before: z.string().datetime() }),
  z.object({
    kind: z.literal('filter'),
    consultant_id: z.string().uuid().optional(),
    company_id: z.string().uuid().optional(),
    before: z.string().datetime().optional(),
    after:  z.string().datetime().optional(),
    enrichment_status: z.enum(['pending', 'enriched']).optional(),
  }),
]);

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', detail: parsed.error.format() }, { status: 400 });
  }
  const supa = supabaseService();
  const body = parsed.data;

  let q = supa.from('contacts').delete({ count: 'exact' });
  switch (body.kind) {
    case 'upload':
      q = q.eq('upload_id', body.upload_id);
      break;
    case 'company':
      q = q.eq('company_id', body.company_id);
      break;
    case 'older_than':
      q = q.lt('created_at', body.before);
      break;
    case 'filter':
      if (body.consultant_id) q = q.eq('uploaded_by', body.consultant_id);
      if (body.company_id) q = q.eq('company_id', body.company_id);
      if (body.before) q = q.lt('created_at', body.before);
      if (body.after) q = q.gt('created_at', body.after);
      if (body.enrichment_status) q = q.eq('enrichment_status', body.enrichment_status);
      // Safety: 'filter' without ANY filter would wipe the whole pool. Reject.
      if (!body.consultant_id && !body.company_id && !body.before && !body.after && !body.enrichment_status) {
        return NextResponse.json({ error: 'filter_too_broad' }, { status: 400 });
      }
      break;
  }
  const { error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(supa, auth.consultant.id, 'bulk_delete_pool', {
    type: 'pool', metadata: { kind: body.kind, deleted: count ?? 0, body },
  });

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
