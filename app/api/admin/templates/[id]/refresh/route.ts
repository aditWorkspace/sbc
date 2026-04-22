import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';

const Body = z.object({ reEnrich: z.boolean().default(false) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const { reEnrich } = parsed.data;
  const supa = supabaseService();
  await supa.from('companies').update({
    template_confidence: 'UNKNOWN', template_pattern: null, domain: null,
    sample_size: 0, matching_samples: 0, locked_at: null,
  }).eq('id', params.id);
  if (reEnrich) {
    await supa.from('contacts').update({
      enrichment_status: 'pending', email: null, email_source: null, enriched_at: null,
    }).eq('company_id', params.id).eq('enrichment_status', 'enriched');
  }
  await supa.from('enrichment_jobs').insert({ company_id: params.id }).then(() => {}, () => {});
  const { audit } = await import('@/lib/security/audit');
  await audit(supa, auth.consultant.id, 'force_refresh_template', {
    type: 'company', id: params.id, metadata: { reEnrich },
  });
  return NextResponse.json({ ok: true });
}
