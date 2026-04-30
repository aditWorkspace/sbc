import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { env } from '@/lib/env';
import { supabaseService } from '@/lib/supabase/service';
import { processEnrichmentJob, countPendingForCompany } from '@/lib/enrichment/process-job';
import { IcypeasRateLimit, IcypeasCreditsExhausted } from '@/lib/icypeas/client';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Cron-job.org's free tier closes the HTTP connection after 30s. Icypeas batches
// commonly take 30-50s, so we'd always look like a failure to the pinger even
// though Vercel was still processing. Fix: do the fast self-heal synchronously,
// kick the slow drain off via waitUntil(), and return 200 within ~1s. waitUntil
// keeps the Vercel function alive up to maxDuration so the work actually finishes.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supa = supabaseService();
  const healed = await selfHealOrphanedCompanies(supa);

  waitUntil(drainQueue(supa));

  return NextResponse.json({ ok: true, healed, drain: 'background' });
}

async function drainQueue(supa: ReturnType<typeof supabaseService>): Promise<void> {
  const { data: jobs } = await supa.from('enrichment_jobs')
    .select('id, company_id, attempts').eq('status', 'queued')
    .order('created_at', { ascending: true }).limit(10);
  if (!jobs || jobs.length === 0) return;

  for (const job of jobs) {
    await supa.from('enrichment_jobs').update({
      status: 'running',
      locked_at: new Date().toISOString(),
      attempts: (job.attempts ?? 0) + 1,
    }).eq('id', job.id);

    try {
      await processEnrichmentJob(supa, job.company_id);
      const stillPending = await countPendingForCompany(supa, job.company_id);
      if (stillPending > 0) {
        await supa.from('enrichment_jobs').update({
          status: 'queued', locked_at: null,
        }).eq('id', job.id);
      } else {
        await supa.from('enrichment_jobs').update({
          status: 'done', completed_at: new Date().toISOString(),
        }).eq('id', job.id);
      }
    } catch (e: unknown) {
      if (e instanceof IcypeasRateLimit) {
        await supa.from('enrichment_jobs').update({
          status: 'queued', locked_at: null, last_error: 'rate_limit',
        }).eq('id', job.id);
        return;
      }
      if (e instanceof IcypeasCreditsExhausted) {
        await supa.from('enrichment_jobs').update({
          status: 'queued', locked_at: null, last_error: 'credits_exhausted',
        }).eq('id', job.id);
        return;
      }
      const attempts = (job.attempts ?? 0) + 1;
      await supa.from('enrichment_jobs').update({
        status: attempts >= 3 ? 'failed' : 'queued',
        locked_at: null,
        last_error: (e as Error)?.message ?? String(e),
      }).eq('id', job.id);
    }
  }
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
