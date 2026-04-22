import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { supabaseService } from '@/lib/supabase/service';
import { processEnrichmentJob } from '@/lib/enrichment/process-job';
import { ApolloRateLimit, ApolloCreditsExhausted } from '@/lib/apollo/client';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supa = supabaseService();

  const { data: jobs } = await supa.from('enrichment_jobs')
    .select('id, company_id, attempts').eq('status', 'queued')
    .order('created_at', { ascending: true }).limit(10);
  if (!jobs || jobs.length === 0) return NextResponse.json({ ok: true, processed: 0 });

  let processed = 0;
  for (const job of jobs) {
    await supa.from('enrichment_jobs').update({
      status: 'running',
      locked_at: new Date().toISOString(),
      attempts: (job.attempts ?? 0) + 1,
    }).eq('id', job.id);

    try {
      await processEnrichmentJob(supa, job.company_id);
      await supa.from('enrichment_jobs').update({
        status: 'done', completed_at: new Date().toISOString(),
      }).eq('id', job.id);
      processed++;
    } catch (e: unknown) {
      if (e instanceof ApolloRateLimit) {
        await supa.from('enrichment_jobs').update({
          status: 'queued', locked_at: null, last_error: 'rate_limit',
        }).eq('id', job.id);
        break;
      }
      if (e instanceof ApolloCreditsExhausted) {
        await supa.from('enrichment_jobs').update({
          status: 'queued', locked_at: null, last_error: 'credits_exhausted',
        }).eq('id', job.id);
        break;
      }
      const attempts = (job.attempts ?? 0) + 1;
      await supa.from('enrichment_jobs').update({
        status: attempts >= 3 ? 'failed' : 'queued',
        locked_at: null,
        last_error: (e as Error)?.message ?? String(e),
      }).eq('id', job.id);
    }
  }
  return NextResponse.json({ ok: true, processed });
}
