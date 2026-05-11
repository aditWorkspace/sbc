import type { SupabaseClient } from '@supabase/supabase-js';
import { icypeasBulkMatch, IcypeasCreditsExhausted, IcypeasRateLimit } from '@/lib/icypeas/client';
import { detectPattern, isPersonalDomain, renderTemplate, type Pattern } from '@/lib/apollo/patterns';
import { tallySamples, evaluateConfidence } from '@/lib/enrichment/tally';

const BATCH = 5;

export async function processEnrichmentJob(supa: SupabaseClient, companyId: string): Promise<void> {
  const { data: company } = await supa.from('companies').select('*').eq('id', companyId).single();
  if (!company) return;

  // Fast path: template already locked — render from template, no Apollo call
  if (['HIGH','MEDIUM','LOW'].includes(company.template_confidence)
      && company.template_pattern && company.domain) {
    await fillPendingViaTemplate(supa, company);
    return;
  }

  // Pick up to 10 pending contacts for this company
  const { data: pending } = await supa
    .from('contacts').select('*')
    .eq('company_id', companyId).eq('enrichment_status', 'pending')
    .limit(BATCH);
  if (!pending || pending.length === 0) return;

  let response;
  try {
    response = await icypeasBulkMatch(pending.map((p: any) => ({
      first_name: p.first_name,
      last_name: p.last_name ?? undefined,
      organization_name: p.company_display,
    })));
  } catch (e) {
    if (e instanceof IcypeasRateLimit) throw e;
    if (e instanceof IcypeasCreditsExhausted) throw e;
    // Any other unexpected throw from the client — leave contacts pending (don't delete)
    // and rethrow so the cron route can attempts++ / failure-count.
    throw e;
  }

  let creditsThisCall = 0;
  for (let i = 0; i < pending.length; i++) {
    const c: any = pending[i]!;
    const m = response.matches[i];

    // Tristate from icypeasBulkMatch:
    //   undefined = transient (poll deadline / network) — leave pending, retry next tick
    //   null      = definite no-match — delete per policy
    //   object    = email returned (verified or guessed) — process below
    if (m === undefined) {
      continue;
    }
    if (m === null || !m.email) {
      // Definite no-match. Record an apollo_samples row with reason
      // 'no_email_found' BEFORE the delete so (a) Stage D dedupe skips this exact
      // name on the next upload (no point re-burning a credit Icypeas already
      // proved is fruitless), and (b) the consultant can see WHY 252 contacts
      // vanished. Without this audit row, NOT_FOUND silently dropped every
      // typo'd company name with zero diagnostic — which is exactly what
      // triggered this fix. (The reason name has to be one of the values in
      // the apollo_samples.email_ignored_reason CHECK constraint — 'no_email_found'
      // was already enrolled but unused; we adopt it instead of bumping the
      // constraint.)
      const { error: sErr } = await supa.from('apollo_samples').insert({
        company_id: companyId,
        person_first_name: c.first_name, person_last_name: c.last_name,
        email_returned: null, email_ignored_reason: 'no_email_found',
        credits_spent: 1,
      });
      if (sErr) throw sErr;
      await supa.from('contacts').delete().eq('id', c.id);
      continue;
    }
    if (m.email_status !== 'verified' && m.email_status !== 'guessed') {
      await supa.from('apollo_samples').insert({
        company_id: companyId,
        person_first_name: c.first_name, person_last_name: c.last_name,
        email_returned: m.email, email_ignored_reason: 'guessed_status',
        credits_spent: 1,
      });
      await supa.from('contacts').delete().eq('id', c.id);
      continue;
    }
    const parts = m.email.split('@');
    if (parts.length !== 2) { await supa.from('contacts').delete().eq('id', c.id); continue; }
    const domain = parts[1]!.toLowerCase();
    if (isPersonalDomain(domain)) {
      await supa.from('apollo_samples').insert({
        company_id: companyId,
        person_first_name: c.first_name, person_last_name: c.last_name,
        email_returned: m.email, email_ignored_reason: 'personal_domain',
        credits_spent: 1,
      });
      await supa.from('contacts').delete().eq('id', c.id);
      continue;
    }
    // The old wrong_company guard (compare normalize(m.organization?.name) to
    // company.name_normalized) lived here. It was dead code: the Icypeas response
    // never includes a company name (verified empirically against the live API
    // 2026-05-10), so m.organization?.name was always undefined and the check
    // never fired. Pattern detection below already cross-validates the email's
    // local part against the contact's first/last name, which is a stronger
    // sanity check than a string-equal on a name we never receive.
    const det = detectPattern(c.first_name, c.last_name, m.email);
    await supa.from('apollo_samples').insert({
      company_id: companyId,
      person_first_name: c.first_name, person_last_name: c.last_name,
      email_returned: m.email,
      detected_pattern: det?.pattern ?? null, detected_domain: det?.domain ?? null,
      email_ignored_reason: det ? null : 'no_pattern_match',
      credits_spent: 1,
    });
    creditsThisCall++;

    if (det) {
      await supa.from('contacts').update({
        email: m.email,
        email_source: 'apollo_direct',
        enrichment_status: 'enriched',
        enriched_at: new Date().toISOString(),
      }).eq('id', c.id);
    } else {
      await supa.from('contacts').delete().eq('id', c.id);
    }
  }

  // Re-tally and update company state
  const { data: samples } = await supa.from('apollo_samples')
    .select('detected_pattern, detected_domain, email_ignored_reason').eq('company_id', companyId);
  const t = tallySamples((samples ?? []) as any);
  const confidence = evaluateConfidence(t.matchCount, t.totalSamples);
  const lockable = ['HIGH','MEDIUM','LOW'].includes(confidence);
  await supa.from('companies').update({
    sample_size: t.totalSamples,
    matching_samples: t.matchCount,
    template_pattern: t.winnerPattern,
    domain: t.winnerDomain,
    template_confidence: confidence,
    apollo_credits_spent: company.apollo_credits_spent + creditsThisCall,
    last_sampled_at: new Date().toISOString(),
    locked_at: lockable ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', companyId);

  if (lockable) {
    const { data: updated } = await supa.from('companies').select('*').eq('id', companyId).single();
    if (updated) await fillPendingViaTemplate(supa, updated);
  }
}

// Helper: count contacts still pending for a company. Callers use this after
// processEnrichmentJob to decide whether to mark the job 'done' or keep it 'queued'
// for the next tick. We can't insert a *new* job per call because of the
// `enrichment_jobs_per_company_unique` partial index — there can be at most one
// queued/running job per company at a time.
export async function countPendingForCompany(
  supa: SupabaseClient,
  companyId: string,
): Promise<number> {
  const { count } = await supa.from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('enrichment_status', 'pending');
  return count ?? 0;
}

async function fillPendingViaTemplate(supa: SupabaseClient, company: any): Promise<void> {
  const { data: pending } = await supa.from('contacts').select('*')
    .eq('company_id', company.id).eq('enrichment_status', 'pending');
  if (!pending || !pending.length) return;
  for (const c of pending as any[]) {
    const email = renderTemplate(c.first_name, c.last_name, company.template_pattern as Pattern, company.domain);
    if (email) {
      await supa.from('contacts').update({
        email, email_source: 'template', enrichment_status: 'enriched',
        enriched_at: new Date().toISOString(),
      }).eq('id', c.id);
    } else {
      // Pattern can't render (last_name empty for last-needing pattern) — delete per policy
      await supa.from('contacts').delete().eq('id', c.id);
    }
  }
}

