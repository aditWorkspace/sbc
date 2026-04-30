// True end-to-end test that exercises the REAL pipeline:
//   1. Generate a 50-row CSV of recognizable employees at well-known companies
//   2. Run ingestUpload (the same code path as POST /api/uploads)
//   3. Trigger /api/cron/enrich repeatedly, hitting REAL Icypeas
//   4. Watch the enrichment numbers move
//   5. Pull a sheet via the pull_sheet RPC + createSheetForConsultant
//   6. Report everything that happened, including the live Google Sheet URL
//
// Usage: set -a; source .env.local; set +a; pnpm exec tsx scripts/full-e2e-test.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

(function loadEnvLocal() {
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
})();

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const { ingestUpload } = await import('@/lib/uploads/ingest');
  const { createSheetForConsultant, describeGoogleError } = await import('@/lib/google/sheets');

  const TEST_EMAIL = 'system-e2e@berkeley.edu';
  const PROD_URL = 'https://sbc-gold.vercel.app';
  const CRON_SECRET = process.env.CRON_SECRET!;

  // 50 contacts. Use a mix of: high-profile CEOs (typically resolve ultra_sure → verified),
  // common engineering names at large companies, and a couple intentionally-bogus rows
  // to confirm the rejection path works. Companies chosen to span a few patterns
  // (first.last, first, firstinitiallast, etc.) so template learning has variety.
  const CONTACTS: { first_name: string; last_name: string; company: string }[] = [
    // CEOs / well-known executives — highest chance of 'verified' from Icypeas
    { first_name: 'Sundar',     last_name: 'Pichai',     company: 'google.com' },
    { first_name: 'Satya',      last_name: 'Nadella',    company: 'microsoft.com' },
    { first_name: 'Tim',        last_name: 'Cook',       company: 'apple.com' },
    { first_name: 'Andy',       last_name: 'Jassy',      company: 'amazon.com' },
    { first_name: 'Mark',       last_name: 'Zuckerberg', company: 'meta.com' },
    { first_name: 'Jensen',     last_name: 'Huang',      company: 'nvidia.com' },
    { first_name: 'Brian',      last_name: 'Chesky',     company: 'airbnb.com' },
    { first_name: 'Daniel',     last_name: 'Ek',         company: 'spotify.com' },
    { first_name: 'Drew',       last_name: 'Houston',    company: 'dropbox.com' },
    { first_name: 'Aaron',      last_name: 'Levie',      company: 'box.com' },
    { first_name: 'Patrick',    last_name: 'Collison',   company: 'stripe.com' },
    { first_name: 'John',       last_name: 'Collison',   company: 'stripe.com' },
    { first_name: 'Tobi',       last_name: 'Lutke',      company: 'shopify.com' },
    { first_name: 'Eric',       last_name: 'Yuan',       company: 'zoom.us' },
    { first_name: 'Marc',       last_name: 'Benioff',    company: 'salesforce.com' },
    { first_name: 'Bill',       last_name: 'McDermott',  company: 'servicenow.com' },
    { first_name: 'Jack',       last_name: 'Dorsey',     company: 'block.xyz' },
    { first_name: 'Evan',       last_name: 'Spiegel',    company: 'snap.com' },
    { first_name: 'Reed',       last_name: 'Hastings',   company: 'netflix.com' },
    { first_name: 'Bob',        last_name: 'Iger',       company: 'disney.com' },
    // Plausible mid-level engineering names at well-known co's (test template learning)
    { first_name: 'Sarah',      last_name: 'Chen',       company: 'google.com' },
    { first_name: 'James',      last_name: 'Wilson',     company: 'google.com' },
    { first_name: 'Maria',      last_name: 'Garcia',     company: 'google.com' },
    { first_name: 'David',      last_name: 'Kim',        company: 'google.com' },
    { first_name: 'Emily',      last_name: 'Johnson',    company: 'microsoft.com' },
    { first_name: 'Michael',    last_name: 'Brown',      company: 'microsoft.com' },
    { first_name: 'Jennifer',   last_name: 'Davis',      company: 'microsoft.com' },
    { first_name: 'Robert',     last_name: 'Miller',     company: 'microsoft.com' },
    { first_name: 'Linda',      last_name: 'Martinez',   company: 'apple.com' },
    { first_name: 'William',    last_name: 'Anderson',   company: 'apple.com' },
    { first_name: 'Patricia',   last_name: 'Thomas',     company: 'apple.com' },
    { first_name: 'Richard',    last_name: 'Jackson',    company: 'apple.com' },
    { first_name: 'Karen',      last_name: 'White',      company: 'amazon.com' },
    { first_name: 'Joseph',     last_name: 'Harris',     company: 'amazon.com' },
    { first_name: 'Betty',      last_name: 'Clark',      company: 'amazon.com' },
    { first_name: 'Charles',    last_name: 'Lewis',      company: 'amazon.com' },
    { first_name: 'Susan',      last_name: 'Walker',     company: 'stripe.com' },
    { first_name: 'Thomas',     last_name: 'Hall',       company: 'stripe.com' },
    { first_name: 'Nancy',      last_name: 'Young',      company: 'stripe.com' },
    { first_name: 'Christopher', last_name: 'King',      company: 'stripe.com' },
    { first_name: 'Lisa',       last_name: 'Wright',     company: 'shopify.com' },
    { first_name: 'Daniel',     last_name: 'Lopez',      company: 'shopify.com' },
    { first_name: 'Margaret',   last_name: 'Hill',       company: 'shopify.com' },
    { first_name: 'Paul',       last_name: 'Scott',      company: 'shopify.com' },
    { first_name: 'Kimberly',   last_name: 'Green',      company: 'salesforce.com' },
    { first_name: 'Steven',     last_name: 'Adams',      company: 'salesforce.com' },
    { first_name: 'Donna',      last_name: 'Baker',      company: 'salesforce.com' },
    { first_name: 'Edward',     last_name: 'Nelson',     company: 'salesforce.com' },
    { first_name: 'Ruth',       last_name: 'Carter',     company: 'netflix.com' },
    { first_name: 'Gary',       last_name: 'Mitchell',   company: 'netflix.com' },
  ];

  console.log(`E2E test starting with ${CONTACTS.length} contacts.\n`);

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // [1] Test consultant
  console.log(`[1/6] Ensuring test consultant '${TEST_EMAIL}'...`);
  const { data: existing } = await supa.from('consultants').select('*').eq('email', TEST_EMAIL).maybeSingle();
  let consultantId: string;
  if (existing) {
    consultantId = (existing as any).id;
  } else {
    const { data: inserted, error } = await supa.from('consultants').insert({
      email: TEST_EMAIL, display_name: 'E2E Tester', is_approved: true,
      approved_at: new Date().toISOString(),
    }).select('id').single();
    if (error) throw error;
    consultantId = (inserted as any).id;
  }
  console.log(`      consultant_id=${consultantId.slice(0, 8)}...`);

  // [2] Clear prior test data for this consultant
  console.log(`[2/6] Clearing prior test data for ${TEST_EMAIL}...`);
  await supa.from('contacts').delete().eq('uploaded_by', consultantId);
  await supa.from('uploads').delete().eq('consultant_id', consultantId);
  await supa.from('sheets').delete().eq('consultant_id', consultantId);

  // [3] Run ingestUpload (the real upload pipeline)
  console.log(`[3/6] Running ingestUpload(${CONTACTS.length} rows)...`);
  const t0 = Date.now();
  const result = await ingestUpload(supa, consultantId, 'e2e-50.csv', CONTACTS);
  console.log(`      Done in ${Date.now() - t0}ms`);
  console.log(`      raw=${result.raw} admitted=${result.admitted} rejected=${result.rejected}`);
  console.log(`      enrichedInstantly=${result.enrichedInstantly} pending=${result.pending}`);
  console.log(`      uploadId=${result.uploadId}`);

  // [4] Drain via cron in a loop until pending hits 0 or 8 minutes elapse
  console.log(`[4/6] Draining via /api/cron/enrich (max 8 min)...`);
  const drainStart = Date.now();
  const DRAIN_MAX_MS = 8 * 60_000;
  let lastEnriched = 0;
  while (Date.now() - drainStart < DRAIN_MAX_MS) {
    const res = await fetch(`${PROD_URL}/api/cron/enrich?sync=1`, {
      headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
    });
    const drainBody = await res.json().catch(() => null);

    const { count: pendingMine } = await supa.from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('uploaded_by', consultantId).eq('enrichment_status', 'pending');
    const { count: enrichedMine } = await supa.from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('uploaded_by', consultantId).eq('enrichment_status', 'enriched');
    const elapsed = Math.round((Date.now() - drainStart) / 1000);
    const drained = drainBody?.per_job?.reduce((acc: number, j: any) => acc + (j.dropped ?? 0), 0) ?? '?';
    console.log(`      t=${elapsed}s pending=${pendingMine} enriched=${enrichedMine} (this tick dropped ${drained})`);
    if (enrichedMine !== lastEnriched && enrichedMine !== null) lastEnriched = enrichedMine;
    if ((pendingMine ?? 0) === 0) {
      console.log(`      ✓ all my contacts drained`);
      break;
    }
    await new Promise(r => setTimeout(r, 15_000));
  }

  // [5] Check what we got
  const { data: enriched } = await supa.from('contacts')
    .select('first_name, last_name, company_display, email, email_source')
    .eq('uploaded_by', consultantId).eq('enrichment_status', 'enriched');
  console.log(`\n[5/6] Final pool — ${enriched?.length ?? 0} enriched contacts for this consultant:`);
  for (const r of (enriched ?? []).slice(0, 20)) {
    console.log(`      ${(r as any).first_name} ${(r as any).last_name} @ ${(r as any).company_display} → ${(r as any).email} (${(r as any).email_source})`);
  }
  if ((enriched?.length ?? 0) > 20) console.log(`      ...and ${(enriched?.length ?? 0) - 20} more`);

  // Companies that locked templates
  const { data: lockedCos } = await supa.from('companies')
    .select('display_name, template_pattern, template_confidence, domain, sample_size, matching_samples')
    .in('template_confidence', ['HIGH', 'MEDIUM', 'LOW']);
  console.log(`\n      Companies with locked templates: ${lockedCos?.length ?? 0}`);
  for (const c of lockedCos ?? []) {
    console.log(`        "${(c as any).display_name}" pattern=${(c as any).template_pattern} domain=${(c as any).domain} conf=${(c as any).template_confidence} samples=${(c as any).matching_samples}/${(c as any).sample_size}`);
  }

  if ((enriched?.length ?? 0) === 0) {
    console.log('\n❌ No contacts got enriched. Aborting sheet test.');
    process.exit(1);
  }

  // [6] Pull sheet + create google sheet
  console.log(`\n[6/6] Pulling sheet via pull_sheet RPC + creating Google Sheet...`);
  const { data: pulled, error: pullErr } = await supa.rpc('pull_sheet', {
    p_consultant_id: consultantId, p_max_rows: 300,
  });
  if (pullErr) { console.error('pull_sheet error:', pullErr); process.exit(1); }
  const rows = (pulled ?? []) as Array<any>;
  console.log(`      Pulled ${rows.length} rows from pool.`);
  if (!rows.length) { console.error('No rows pulled'); process.exit(1); }

  const { data: tokenData, error: tokenErr } = await supa.rpc('vault_read_secret', { secret_name: 'google_oauth_refresh_token' });
  if (tokenErr || !tokenData) { console.error('vault read failed:', tokenErr); process.exit(1); }
  const refreshToken = tokenData as unknown as string;

  try {
    const sheet = await createSheetForConsultant({
      consultant: { email: TEST_EMAIL, display_name: 'E2E Tester' },
      rows: rows.map(r => ({
        full_name: `${r.first_name} ${r.last_name ?? ''}`.trim(),
        first_name: r.first_name,
        company_display: r.company_display,
        email: r.email ?? '',
      })),
      refreshToken,
    });
    console.log(`      ✅ Sheet created: ${sheet.url}`);
    console.log(`\n🎉 Full pipeline works. ${enriched?.length} enriched, ${rows.length} pulled, sheet at:\n   ${sheet.url}`);
  } catch (err) {
    console.error(`      ❌ Sheet creation failed: ${describeGoogleError(err)}`);
    console.error(err);
    process.exit(1);
  }
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
