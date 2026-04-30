import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/service';

// Public, unauthenticated. Returns only aggregate counts — no PII, no email addresses,
// no consultant identifiers. Safe to expose for external uptime / drain probes.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const supa = supabaseService();
  const now = Date.now();

  const [queued, running, pendingContacts, oldestQueuedJob, oldestPendingContact, recentDone, recentFailed] = await Promise.all([
    supa.from('enrichment_jobs').select('*', { count: 'exact', head: true }).eq('status', 'queued'),
    supa.from('enrichment_jobs').select('*', { count: 'exact', head: true }).eq('status', 'running'),
    supa.from('contacts').select('*', { count: 'exact', head: true }).eq('enrichment_status', 'pending'),
    supa.from('enrichment_jobs').select('created_at').eq('status', 'queued').order('created_at', { ascending: true }).limit(1).maybeSingle(),
    supa.from('contacts').select('created_at').eq('enrichment_status', 'pending').order('created_at', { ascending: true }).limit(1).maybeSingle(),
    supa.from('enrichment_jobs').select('*', { count: 'exact', head: true }).eq('status', 'done').gte('completed_at', new Date(now - 24 * 3600_000).toISOString()),
    supa.from('enrichment_jobs').select('*', { count: 'exact', head: true }).eq('status', 'failed').gte('locked_at', new Date(now - 24 * 3600_000).toISOString()),
  ]);

  const ageSec = (iso: string | null | undefined) =>
    iso ? Math.floor((now - new Date(iso).getTime()) / 1000) : null;

  const oldestQueuedJobAgeS = ageSec(oldestQueuedJob.data?.created_at);
  const oldestPendingContactAgeS = ageSec(oldestPendingContact.data?.created_at);

  // "draining" means: either there's no work to do, or work IS happening.
  //   - no pending contacts             → nothing to drain, healthy
  //   - any running job                 → worker is actively processing
  //   - oldest queued job < 20 min      → cron has touched it recently
  // A long-running company-drain (one job cycling queued↔running through many
  // ticks of BATCH=10) keeps job age old, so we accept up to 20 min of
  // continuous activity rather than firing a false alarm.
  const draining =
    (pendingContacts.count ?? 0) === 0 ||
    (running.count ?? 0) > 0 ||
    (oldestQueuedJobAgeS !== null && oldestQueuedJobAgeS < 1200);

  return NextResponse.json({
    timestamp: new Date(now).toISOString(),
    draining,
    jobs: {
      queued: queued.count ?? 0,
      running: running.count ?? 0,
      done_last_24h: recentDone.count ?? 0,
      failed_last_24h: recentFailed.count ?? 0,
      oldest_queued_age_seconds: oldestQueuedJobAgeS,
    },
    contacts: {
      pending: pendingContacts.count ?? 0,
      oldest_pending_age_seconds: oldestPendingContactAgeS,
    },
  });
}
