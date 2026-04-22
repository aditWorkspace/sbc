import type { SupabaseClient } from '@supabase/supabase-js';
import { apolloBulkMatch, ApolloCreditsExhausted, ApolloRateLimit } from '@/lib/apollo/client';
import { detectPattern, isPersonalDomain, renderTemplate, type Pattern } from '@/lib/apollo/patterns';
import { normalize } from '@/lib/csv/normalize';
import { tallySamples, evaluateConfidence } from '@/lib/enrichment/tally';

const BATCH = 10;

export async function processEnrichmentJob(supa: SupabaseClient, companyId: string): Promise<void> {
  const { data: company } = await supa.from('companies').select('*').eq('id', companyId).single();
  if (!company) return;

  // Fast path: template already locked — render from template, no Apollo call
  if (['HIGH','MEDIUM','LOW'].includes(company.template_confidence)
      && company.template_pattern && company.domain) {
    await fillPendingViaTemplate(supa, company);
    await reenqueueIfPending(supa, companyId);
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
    response = await apolloBulkMatch(pending.map((p: any) => ({
      first_name: p.first_name,
      last_name: p.last_name ?? undefined,
      organization_name: p.company_display,
    })));
  } catch (e) {
    if (e instanceof ApolloRateLimit) throw e;
    if (e instanceof ApolloCreditsExhausted) throw e;
    // Other Apollo errors — delete these pending rows per policy; rethrow for retry/failure counting
    await supa.from('contacts').delete().in('id', pending.map((p: any) => p.id));
    throw e;
  }

  let creditsThisCall = 0;
  for (let i = 0; i < pending.length; i++) {
    const c: any = pending[i]!;
    const m = response.matches[i];

    if (!m || !m.email) {
      await supa.from('contacts').delete().eq('id', c.id);
      continue;
    }
    if (m.email_status !== 'verified') {
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
    const returnedOrgNorm = normalize(m.organization?.name ?? '');
    if (returnedOrgNorm && returnedOrgNorm !== company.name_normalized) {
      await supa.from('apollo_samples').insert({
        company_id: companyId,
        person_first_name: c.first_name, person_last_name: c.last_name,
        email_returned: m.email, email_ignored_reason: 'wrong_company',
        credits_spent: 1,
      });
      await supa.from('contacts').delete().eq('id', c.id);
      continue;
    }
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
  await reenqueueIfPending(supa, companyId);
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

async function reenqueueIfPending(supa: SupabaseClient, companyId: string): Promise<void> {
  const { count } = await supa.from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('enrichment_status', 'pending');
  if (count && count > 0) {
    await supa.from('enrichment_jobs').insert({ company_id: companyId }).then(() => {}, () => {});
  }
}
