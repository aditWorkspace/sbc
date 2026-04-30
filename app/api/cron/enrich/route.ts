import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { supabaseService } from '@/lib/supabase/service';
import { processEnrichmentJob, countPendingForCompany } from '@/lib/enrichment/process-job';
import { IcypeasRateLimit, IcypeasCreditsExhausted } from '@/lib/icypeas/client';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supa = supabaseService();

  // Self-heal: any company with pending contacts but no active job gets re-queued.
  // This recovers from the historical bug where reenqueueIfPending was racing the
  // unique-job-per-company partial index and failing silently. Idempotent — relies
  // on `enrichment_jobs_per_company_unique` to dedupe duplicate inserts.
  const healed = await selfHealOrphanedCompanies(supa);

  const { data: jobs } = await supa.from('enrichment_jobs')
    .select('id, company_id, attempts').eq('status', 'queued')
    .order('created_at', { ascending: true }).limit(10);
  if (!jobs || jobs.length === 0) return NextResponse.json({ ok: true, processed: 0, healed });

  let processed = 0;
  for (const job of jobs) {
    await supa.from('enrichment_jobs').update({
      status: 'running',
      locked_at: new Date().toISOString(),
      attempts: (job.attempts ?? 0) + 1,
    }).eq('id', job.id);

    try {
      await processEnrichmentJob(supa, job.company_id);
      // If pending contacts remain for this company (we hit BATCH=10 ceiling),
      // keep this job queued for the next tick. Mark 'done' only when truly drained.
      const stillPending = await countPendingForCompany(supa, job.company_id);
      if (stillPending > 0) {
        await supa.from('enrichment_jobs').update({
          status: 'queued', locked_at: null,
        }).eq('id', job.id);
      } else {
        await supa.from('enrichment_jobs').update({
          status: 'done', completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        processed++;
      }
    } catch (e: unknown) {
      if (e instanceof IcypeasRateLimit) {
        await supa.from('enrichment_jobs').update({
          status: 'queued', locked_at: null, last_error: 'rate_limit',
        }).eq('id', job.id);
        break;
      }
      if (e instanceof IcypeasCreditsExhausted) {
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
  return NextResponse.json({ ok: true, processed, healed });
}

// Find companies with pending contacts but no queued/running job, and insert one.
// Bounded to 100 per tick to keep this cheap.
async function selfHealOrphanedCompanies(supa: ReturnType<typeof supabaseService>): Promise<number> {
  // Distinct company_ids of pending contacts
  const { data: pendingCompanies } = await supa
    .from('contacts')
    .select('company_id')
    .eq('enrichment_status', 'pending')
    .limit(1000);
  if (!pendingCompanies || pendingCompanies.length === 0) return 0;

  const distinctCompanyIds = Array.from(new Set(pendingCompanies.map((r: any) => r.company_id))).slice(0, 100);

  // Already-active jobs for any of those companies
  const { data: activeJobs } = await supa
    .from('enrichment_jobs')
    .select('company_id')
    .in('status', ['queued', 'running'])
    .in('company_id', distinctCompanyIds);
  const active = new Set((activeJobs ?? []).map((j: any) => j.company_id));

  const orphans = distinctCompanyIds.filter(id => !active.has(id));
  if (orphans.length === 0) return 0;

  // Insert in one shot. Unique partial index on (company_id) where status in
  // (queued, running) prevents accidental duplicates if this races with another tick.
  const { count } = await supa
    .from('enrichment_jobs')
    .insert(orphans.map(id => ({ company_id: id })), { count: 'exact' });
  return count ?? orphans.length;
}
