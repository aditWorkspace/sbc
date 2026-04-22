// Focused test: upload 12 people across 4 companies with known-distinct email
// patterns, run real Icypeas enrichment, then report what patterns the detector
// learned per company. Uses ≈12 Icypeas credits.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal();

import { createClient } from '@supabase/supabase-js';
import { ingestUpload } from '@/lib/uploads/ingest';
import { processEnrichmentJob } from '@/lib/enrichment/process-job';

// Each company has 3 known public individuals. The EXPECTED_PATTERN column
// is what we THINK their pattern should be based on public knowledge. Icypeas
// is the source of truth — we'll see what comes back.
const PROBES: Array<{ first_name: string; last_name: string; company: string; expected_pattern: string }> = [
  // HubSpot — historically first.last@hubspot.com
  { first_name: 'Dharmesh', last_name: 'Shah',     company: 'HubSpot', expected_pattern: 'first.last' },
  { first_name: 'Brian',    last_name: 'Halligan', company: 'HubSpot', expected_pattern: 'first.last' },
  { first_name: 'Yamini',   last_name: 'Rangan',   company: 'HubSpot', expected_pattern: 'first.last' },

  // Stripe — often first@stripe.com
  { first_name: 'Patrick',  last_name: 'Collison', company: 'Stripe',  expected_pattern: 'first' },
  { first_name: 'John',     last_name: 'Collison', company: 'Stripe',  expected_pattern: 'first' },
  { first_name: 'David',    last_name: 'Singleton', company: 'Stripe', expected_pattern: 'first' },

  // Icypeas itself — their docs show pierre.landoin@icypeas.com
  { first_name: 'Pierre',   last_name: 'Landoin',  company: 'icypeas.com', expected_pattern: 'first.last' },
  { first_name: 'Arnaud',   last_name: 'Riffault', company: 'icypeas.com', expected_pattern: 'first.last' },
  { first_name: 'Hugo',     last_name: 'Tardieu',  company: 'icypeas.com', expected_pattern: 'first.last' },

  // a16z — `flast@a16z.com` is common
  { first_name: 'Marc',     last_name: 'Andreessen', company: 'Andreessen Horowitz', expected_pattern: 'flast' },
  { first_name: 'Ben',      last_name: 'Horowitz',   company: 'Andreessen Horowitz', expected_pattern: 'flast' },
  { first_name: 'Chris',    last_name: 'Dixon',      company: 'Andreessen Horowitz', expected_pattern: 'flast' },
];

const TEST_EMAIL = 'pattern-test@berkeley.edu';

async function main() {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  console.log('[setup] Creating test consultant...');
  const { data: existing } = await supa.from('consultants').select('*').eq('email', TEST_EMAIL).maybeSingle();
  let consultantId: string;
  if (existing) {
    consultantId = existing.id;
  } else {
    const { data: inserted } = await supa.from('consultants').insert({
      email: TEST_EMAIL, display_name: 'Pattern Test', is_approved: true,
    }).select('id').single();
    consultantId = inserted!.id;
  }

  console.log('[setup] Clearing ALL prior state for these probes (fresh test)...');
  const companyNames = [...new Set(PROBES.map(p => p.company.toLowerCase().replace(/[^a-z]/g, '')))];
  for (const cn of companyNames) {
    const { data: c } = await supa.from('companies').select('id').eq('name_normalized', cn).maybeSingle();
    if (c) {
      await supa.from('apollo_samples').delete().eq('company_id', c.id);
      await supa.from('contacts').delete().eq('company_id', c.id);
      await supa.from('enrichment_jobs').delete().eq('company_id', c.id);
      await supa.from('companies').update({
        template_confidence: 'UNKNOWN', template_pattern: null, domain: null,
        sample_size: 0, matching_samples: 0, locked_at: null,
      }).eq('id', c.id);
    }
  }
  // Also clear dedup_archive for these specific (first, last, company) — so a previously
  // pulled-into-sheet row doesn't get filtered on this test run.
  for (const p of PROBES) {
    const first = p.first_name.toLowerCase().replace(/[^a-z]/g, '');
    const last = p.last_name.toLowerCase().replace(/[^a-z]/g, '');
    const co = p.company.toLowerCase().replace(/[^a-z]/g, '');
    const key = `${first}|${last}|${co}`;
    await supa.from('dedup_archive').delete().eq('normalized_key', key);
  }

  console.log(`[ingest] Uploading ${PROBES.length} probe rows...`);
  const result = await ingestUpload(supa, consultantId, 'pattern-probe.csv', PROBES.map(p => ({
    first_name: p.first_name, last_name: p.last_name, company: p.company,
  })));
  console.log(`  admitted=${result.admitted} pending=${result.pending}`);

  console.log('[enrich] Draining enrichment queue (one job per company)...');
  const { data: jobs } = await supa.from('enrichment_jobs').select('id, company_id').eq('status', 'queued');
  for (const job of (jobs ?? [])) {
    process.stdout.write(`  processing company ${job.company_id.slice(0, 8)}... `);
    const started = Date.now();
    await supa.from('enrichment_jobs').update({ status: 'running', locked_at: new Date().toISOString() }).eq('id', job.id);
    try {
      await processEnrichmentJob(supa, job.company_id);
      await supa.from('enrichment_jobs').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', job.id);
      console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (e) {
      console.log(`FAILED: ${(e as Error).message}`);
      await supa.from('enrichment_jobs').update({ status: 'failed', last_error: (e as Error).message }).eq('id', job.id);
    }
  }

  console.log('\n=== RESULTS ===\n');

  const byCompany = new Map<string, typeof PROBES>();
  for (const p of PROBES) {
    const key = p.company.toLowerCase().replace(/[^a-z]/g, '');
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(p);
  }

  let totalCorrect = 0;
  let totalTested = 0;

  for (const [cnNorm, probes] of byCompany) {
    const { data: company } = await supa.from('companies').select('*').eq('name_normalized', cnNorm).maybeSingle();
    const { data: samples } = await supa.from('apollo_samples')
      .select('person_first_name, person_last_name, email_returned, email_ignored_reason, detected_pattern, detected_domain')
      .eq('company_id', company?.id ?? '')
      .order('sampled_at', { ascending: false });

    console.log(`── ${probes[0]!.company} ──`);
    console.log(`  Expected pattern: ${probes[0]!.expected_pattern}`);
    console.log(`  Company state: confidence=${company?.template_confidence ?? 'MISSING'} pattern=${company?.template_pattern ?? 'null'} domain=${company?.domain ?? 'null'} samples=${company?.sample_size ?? 0}/${company?.matching_samples ?? 0} matching`);

    for (const s of (samples ?? [])) {
      const expected = probes[0]!.expected_pattern;
      const actual = s.detected_pattern ?? 'NO_MATCH';
      const ok = actual === expected ? '✅' : s.email_ignored_reason ? '⚠️ ' : '❌';
      totalTested++;
      if (actual === expected) totalCorrect++;
      console.log(`    ${ok} ${s.person_first_name} ${s.person_last_name} → ${s.email_returned ?? 'no email'} | detected=${actual}${s.email_ignored_reason ? ` (ignored: ${s.email_ignored_reason})` : ''}`);
    }
    console.log();
  }

  console.log(`=== SUMMARY ===`);
  console.log(`Total samples: ${totalTested}`);
  console.log(`Detected pattern matched expected: ${totalCorrect}/${totalTested}`);
  console.log(`Accuracy: ${totalTested > 0 ? ((totalCorrect / totalTested) * 100).toFixed(1) : 0}%`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
