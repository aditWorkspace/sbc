// scripts/e2e-test.ts
// End-to-end test of the SBC Consulting sourcing pipeline against LIVE Supabase + Icypeas.
// Run: pnpm exec tsx scripts/e2e-test.ts 2>&1 | tee /tmp/e2e-results.log

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── 0. Load .env.local (same pattern as setup-admin-oauth.ts) ─────────────────
function loadEnvLocal() {
  try {
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
  } catch (e) {
    console.error('Could not read .env.local — make sure you run this from the project root.');
    throw e;
  }
}
loadEnvLocal();

import { supabaseService } from '@/lib/supabase/service';
import { parseCsv } from '@/lib/csv/parse';
import { mapColumnsByAlias } from '@/lib/csv/map-columns';
import { ingestUpload, type IngestResult } from '@/lib/uploads/ingest';
import { processEnrichmentJob } from '@/lib/enrichment/process-job';
import type { RawRow } from '@/lib/uploads/validate-row';

// ── Types & helpers ────────────────────────────────────────────────────────────

interface CsvSpec {
  file: string;
  label: string;
  expectedAdmitted: number;
  expectedRejected: number;
  expectedArchivedMin: number; // ≥ this on fresh run
  expectedPending: number;
  notes?: string;
}

const CSV_SPECS: CsvSpec[] = [
  {
    file: '01-basic-happy-path.csv',
    label: 'CSV 01',
    expectedAdmitted: 10,
    expectedRejected: 0,
    expectedArchivedMin: 0,
    expectedPending: 10,
  },
  {
    file: '02-aliased-columns.csv',
    label: 'CSV 02',
    expectedAdmitted: 10,
    expectedRejected: 0,
    expectedArchivedMin: 0,
    expectedPending: 10,
    notes: 'Tests "First Name"/"Last Name"/"Company Name" alias mapping',
  },
  {
    file: '03-edge-cases.csv',
    label: 'CSV 03',
    expectedAdmitted: 9,   // 12 raw - 1 intra-file dup - 2 invalid (no first_name / no company) = 9
    expectedRejected: 2,
    expectedArchivedMin: 0,
    expectedPending: 9,
    notes: 'Diacritics, hyphens, 1 intra-file dup, 2 rejections (empty first_name, empty company)',
  },
  {
    file: '04-template-detection.csv',
    label: 'CSV 04',
    expectedAdmitted: 12,
    expectedRejected: 0,
    expectedArchivedMin: 0,
    expectedPending: 12,
    notes: 'Designed to trigger 3/3 template lock for Icypeas, Crisp, Notion, HubSpot',
  },
  {
    file: '05-mixed-large.csv',
    label: 'CSV 05',
    expectedAdmitted: 20,
    expectedRejected: 0,
    expectedArchivedMin: 0,
    expectedPending: 20,
  },
];

const DATA_DIR = resolve(process.cwd(), 'test-data');
const TEST_EMAIL = 'e2e-test@berkeley.edu';
const CRON_MAX_TICKS = 10;
const CRON_TICK_SLEEP_MS = 3000;

let failures: string[] = [];
let warnings: string[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`[ASSERT FAIL] ${msg}`);
    failures.push(msg);
  } else {
    console.log(`[ASSERT] ${msg} ✓`);
  }
}

function warn(msg: string) {
  console.warn(`[WARN] ${msg}`);
  warnings.push(msg);
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const supa = supabaseService();

  // ── PHASE 1: Setup test consultant ──────────────────────────────────────────
  console.log('\n[SETUP] Looking for / creating test consultant...');
  let testConsultantId: string;
  {
    const { data: existing } = await supa
      .from('consultants').select('id').eq('email', TEST_EMAIL).maybeSingle();
    if (existing?.id) {
      testConsultantId = existing.id;
      console.log(`[SETUP] Found existing test consultant id=${testConsultantId}`);
    } else {
      const { data: created, error } = await supa
        .from('consultants')
        .insert({ email: TEST_EMAIL, is_approved: true, is_admin: false, display_name: 'E2E Test' })
        .select('id').single();
      if (error || !created) throw error ?? new Error('Failed to create test consultant');
      testConsultantId = created.id;
      console.log(`[SETUP] Created test consultant id=${testConsultantId}`);
    }
  }

  // ── PHASE 2: Cleanup from prior runs ────────────────────────────────────────
  console.log('\n[CLEANUP] Removing prior test data...');
  {
    // Get upload ids for this consultant
    const { data: priorUploads } = await supa
      .from('uploads').select('id').eq('consultant_id', testConsultantId);
    const uploadIds = (priorUploads ?? []).map(u => u.id);

    // Delete contacts from those uploads
    if (uploadIds.length) {
      const { error: cErr } = await supa.from('contacts').delete().in('upload_id', uploadIds);
      if (cErr) warn(`Cleanup contacts error: ${cErr.message}`);
    }

    // Delete uploads
    if (uploadIds.length) {
      const { error: uErr } = await supa.from('uploads').delete().in('id', uploadIds);
      if (uErr) warn(`Cleanup uploads error: ${uErr.message}`);
    }

    // Delete sheets
    const { error: shErr } = await supa.from('sheets').delete().eq('consultant_id', testConsultantId);
    if (shErr) warn(`Cleanup sheets error: ${shErr.message}`);

    // Delete dedup_archive rows where first_uploaded_by = testConsultantId
    const { error: daErr } = await supa.from('dedup_archive').delete().eq('first_uploaded_by', testConsultantId);
    if (daErr) warn(`Cleanup dedup_archive error: ${daErr.message}`);

    // Delete enrichment_jobs whose company was created by us — we can't easily target this
    // so just delete all queued/running jobs (safe: this is a test env run)
    // Actually only clean up for companies that had contacts from this consultant.
    // Since contacts are already deleted we skip orphan-job cleanup; they'll be no-ops.
    console.log('[CLEANUP] Done.');
  }

  // Summary tracking
  const ingestResults: Map<string, IngestResult & { label: string }> = new Map();

  // ── PHASE 3: For each CSV ────────────────────────────────────────────────────
  for (const spec of CSV_SPECS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${spec.label}] Processing ${spec.file}...`);
    if (spec.notes) console.log(`[${spec.label}] Note: ${spec.notes}`);

    // 3a. Read + parse + map columns
    const raw = readFileSync(resolve(DATA_DIR, spec.file), 'utf8');
    const { headers, rows: rawRows } = parseCsv(raw);
    console.log(`[${spec.label}] Parsed ${rawRows.length} rows, headers: ${headers.join(', ')}`);

    const colMap = mapColumnsByAlias(headers);
    console.log(`[${spec.label}] Column map: first_name="${colMap.first_name}", last_name="${colMap.last_name}", company="${colMap.company}"`);

    if (colMap.unresolved.length > 0) {
      warn(`[${spec.label}] Unresolved columns via alias map: ${colMap.unresolved.join(', ')} — alias mapping failed for ${spec.file}`);
    }

    // Map to RawRow shape
    const mappedRows: RawRow[] = rawRows.map(r => ({
      first_name: colMap.first_name ? r[colMap.first_name] : undefined,
      last_name:  colMap.last_name  ? r[colMap.last_name]  : undefined,
      company:    colMap.company    ? r[colMap.company]    : undefined,
    }));

    // 3b. Ingest
    let result: IngestResult;
    try {
      result = await ingestUpload(supa, testConsultantId, spec.file, mappedRows);
    } catch (e: any) {
      failures.push(`[${spec.label}] ingestUpload threw: ${e?.message}`);
      console.error(`[${spec.label}] INGEST ERROR:`, e);
      continue;
    }

    ingestResults.set(spec.label, { ...result, label: spec.label });

    console.log(`[${spec.label}] IngestResult: raw=${result.raw} deduped=${result.deduped} ` +
      `admitted=${result.admitted} rejected=${result.rejected} ` +
      `archived=${result.archived} alreadyInPool=${result.alreadyInPool} ` +
      `enrichedInstantly=${result.enrichedInstantly} pending=${result.pending}`);

    // 3c. Assertions
    assert(result.admitted === spec.expectedAdmitted,
      `${spec.label}: admitted=${result.admitted} (expected ${spec.expectedAdmitted})`);
    assert(result.rejected === spec.expectedRejected,
      `${spec.label}: rejected=${result.rejected} (expected ${spec.expectedRejected})`);
    assert(result.archived >= spec.expectedArchivedMin,
      `${spec.label}: archived=${result.archived} >= ${spec.expectedArchivedMin}`);

    // pending = admitted - enrichedInstantly
    const expectedPendingActual = result.admitted - result.enrichedInstantly;
    assert(result.pending === expectedPendingActual,
      `${spec.label}: pending=${result.pending} == admitted(${result.admitted}) - enrichedInstantly(${result.enrichedInstantly})`);

    // 3d. Cron enrichment loop
    console.log(`\n[CRON ${spec.label}] Starting enrichment loop (up to ${CRON_MAX_TICKS} ticks)...`);
    for (let tick = 1; tick <= CRON_MAX_TICKS; tick++) {
      // Pull up to 10 queued jobs
      const { data: jobs } = await supa
        .from('enrichment_jobs')
        .select('id, company_id')
        .eq('status', 'queued')
        .limit(10);

      if (!jobs || jobs.length === 0) {
        console.log(`[CRON ${spec.label} tick ${tick}] Queue empty, stopping.`);
        break;
      }

      console.log(`[CRON ${spec.label} tick ${tick}] Processing ${jobs.length} jobs...`);

      // Mark as running
      const jobIds = jobs.map(j => j.id);
      await supa.from('enrichment_jobs').update({ status: 'running', locked_at: new Date().toISOString() })
        .in('id', jobIds);

      // Process each
      let processed = 0;
      for (const job of jobs) {
        try {
          await processEnrichmentJob(supa, job.company_id);
          processed++;
        } catch (e: any) {
          warn(`[CRON ${spec.label} tick ${tick}] job company_id=${job.company_id} error: ${e?.message}`);
          await supa.from('enrichment_jobs').update({
            status: 'failed',
            last_error: e?.message ?? 'unknown',
            completed_at: new Date().toISOString(),
          }).eq('id', job.id);
          continue;
        }
        // Mark done
        await supa.from('enrichment_jobs').update({
          status: 'done',
          completed_at: new Date().toISOString(),
          attempts: 1,
        }).eq('id', job.id);
      }

      console.log(`[CRON ${spec.label} tick ${tick}] Processed ${processed}/${jobs.length} jobs.`);

      if (tick < CRON_MAX_TICKS) {
        await sleep(CRON_TICK_SLEEP_MS);
      }
    }

    // 3e. Post-enrichment stats
    const { data: contacts, error: cErr } = await supa
      .from('contacts')
      .select('id, email, enrichment_status, company_id, company_display')
      .eq('uploaded_by', testConsultantId)
      .eq('upload_id', result.uploadId);

    if (cErr) {
      warn(`[${spec.label}] Could not query post-enrichment contacts: ${cErr.message}`);
    } else {
      const total = contacts?.length ?? 0;
      const withEmail = (contacts ?? []).filter(c => c.email).length;
      const withoutEmail = total - withEmail;
      const deletedEstimate = result.admitted - total;

      console.log(`\n[${spec.label}] Post-enrichment: contacts_in_pool=${total} ` +
        `with_email=${withEmail} without_email=${withoutEmail} ` +
        `deleted_est=${deletedEstimate} (admitted=${result.admitted} - in_pool=${total})`);

      // Show per-company template_confidence
      const companyIds = [...new Set((contacts ?? []).map(c => c.company_id))];
      if (companyIds.length) {
        const { data: companies } = await supa
          .from('companies')
          .select('id, display_name, template_confidence, template_pattern, domain, sample_size, matching_samples')
          .in('id', companyIds);

        console.log(`[${spec.label}] Company template state:`);
        for (const co of companies ?? []) {
          console.log(`  - ${co.display_name}: confidence=${co.template_confidence} ` +
            `pattern=${co.template_pattern ?? 'null'} domain=${co.domain ?? 'null'} ` +
            `samples=${co.sample_size} matching=${co.matching_samples}`);
        }
      }
    }
  }

  // ── PHASE 4: Pull-sheet + dedup archive verification ────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log('[PULL-SHEET] Running pull_sheet RPC...');

  let pullSheetRows: any[] = [];
  let archiveSizeBefore = 0;
  {
    const { count: beforeCount } = await supa
      .from('dedup_archive')
      .select('*', { count: 'exact', head: true })
      .eq('first_uploaded_by', testConsultantId);
    archiveSizeBefore = beforeCount ?? 0;
    console.log(`[PULL-SHEET] dedup_archive size before pull: ${archiveSizeBefore}`);

    // Count enriched contacts before pull
    const { count: enrichedBefore } = await supa
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('uploaded_by', testConsultantId)
      .eq('enrichment_status', 'enriched');
    console.log(`[PULL-SHEET] Enriched contacts before pull: ${enrichedBefore ?? 0}`);

    // Call pull_sheet RPC
    const { data: sheetRows, error: rpcErr } = await supa.rpc('pull_sheet', {
      p_consultant_id: testConsultantId,
      p_max_rows: 100,
    });

    if (rpcErr) {
      failures.push(`pull_sheet RPC error: ${rpcErr.message}`);
      console.error('[PULL-SHEET] RPC error:', rpcErr);
    } else {
      pullSheetRows = sheetRows ?? [];
      console.log(`[PULL-SHEET] RPC returned ${pullSheetRows.length} rows.`);
      assert(pullSheetRows.length > 0, 'pull_sheet returned > 0 rows (some enriched contacts exist)');

      // Verify contacts were deleted
      const { count: afterContactCount } = await supa
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('uploaded_by', testConsultantId)
        .eq('enrichment_status', 'enriched');
      console.log(`[PULL-SHEET] Enriched contacts after pull: ${afterContactCount ?? 0}`);
      assert((afterContactCount ?? 0) === 0, 'Enriched contacts deleted from pool after pull_sheet');

      // Verify dedup_archive grew
      const { count: archiveSizeAfter } = await supa
        .from('dedup_archive')
        .select('*', { count: 'exact', head: true })
        .eq('first_uploaded_by', testConsultantId);
      const archiveGrowth = (archiveSizeAfter ?? 0) - archiveSizeBefore;
      console.log(`[PULL-SHEET] dedup_archive after pull: ${archiveSizeAfter ?? 0} (grew by ${archiveGrowth})`);
      assert(archiveGrowth > 0, `dedup_archive grew by ${archiveGrowth} rows after pull_sheet`);
    }
  }

  // 4b. Re-ingest CSV 01 — should see archived > 0 proving dedup works
  console.log('\n[REUPLOAD] Re-ingesting CSV 01 to verify dedup_archive blocks re-admits...');
  {
    const raw = readFileSync(resolve(DATA_DIR, '01-basic-happy-path.csv'), 'utf8');
    const { headers, rows: rawRows } = parseCsv(raw);
    const colMap = mapColumnsByAlias(headers);
    const mappedRows: RawRow[] = rawRows.map(r => ({
      first_name: colMap.first_name ? r[colMap.first_name] : undefined,
      last_name:  colMap.last_name  ? r[colMap.last_name]  : undefined,
      company:    colMap.company    ? r[colMap.company]    : undefined,
    }));

    const reResult = await ingestUpload(supa, testConsultantId, '01-basic-happy-path.csv (re-upload)', mappedRows);
    console.log(`[REUPLOAD] raw=${reResult.raw} admitted=${reResult.admitted} archived=${reResult.archived} alreadyInPool=${reResult.alreadyInPool}`);
    assert(reResult.archived > 0, `Re-upload CSV 01: archived=${reResult.archived} > 0 (dedup_archive working)`);
  }

  // 4c. Verify last_active_at updated for test consultant
  console.log('\n[VERIFY] Checking consultant last_active_at...');
  {
    const { data: consultant } = await supa
      .from('consultants').select('last_active_at').eq('id', testConsultantId).single();
    console.log(`[VERIFY] last_active_at = ${consultant?.last_active_at ?? 'null'}`);
    // Note: last_active_at is only updated by the resolve_consultant RPC (auth flow)
    // In the e2e test we bypass auth, so it may be null — that's expected behavior.
    if (!consultant?.last_active_at) {
      warn('last_active_at is null — expected since e2e test bypasses auth flow (resolve_consultant RPC not called)');
    }
  }

  // ── PHASE 5: Final summary ───────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('FINAL SUMMARY');
  console.log('═'.repeat(60));

  console.log('\nPer-CSV Results:');
  console.log(
    `${'CSV'.padEnd(8)} ${'Admitted'.padEnd(10)} ${'Expected'.padEnd(10)} ${'Rejected'.padEnd(10)} ${'Archived'.padEnd(10)} ${'Pending'.padEnd(10)} ${'EnrichInst'.padEnd(12)}`
  );
  console.log('─'.repeat(70));
  for (const spec of CSV_SPECS) {
    const r = ingestResults.get(spec.label);
    if (!r) {
      console.log(`${spec.label.padEnd(8)} ERROR - no result`);
      continue;
    }
    const admitMark = r.admitted === spec.expectedAdmitted ? '✓' : '✗';
    console.log(
      `${spec.label.padEnd(8)} ${String(r.admitted).padEnd(9)}${admitMark} ${String(spec.expectedAdmitted).padEnd(10)} ${String(r.rejected).padEnd(10)} ${String(r.archived).padEnd(10)} ${String(r.pending).padEnd(10)} ${String(r.enrichedInstantly).padEnd(12)}`
    );
  }

  // Per-company summary
  console.log('\nPer-Company Template Learning (all companies with samples):');
  const { data: allCompanies } = await supa
    .from('companies')
    .select('display_name, template_confidence, template_pattern, domain, sample_size, matching_samples, apollo_credits_spent')
    .gt('sample_size', 0)
    .order('sample_size', { ascending: false });

  if (allCompanies && allCompanies.length > 0) {
    console.log(
      `${'Company'.padEnd(30)} ${'Confidence'.padEnd(12)} ${'Pattern'.padEnd(12)} ${'Domain'.padEnd(25)} ${'Samples'.padEnd(8)} ${'Match'.padEnd(6)} ${'Credits'}`
    );
    console.log('─'.repeat(100));
    for (const co of allCompanies) {
      console.log(
        `${(co.display_name ?? '').slice(0, 29).padEnd(30)} ${(co.template_confidence ?? '').padEnd(12)} ${(co.template_pattern ?? 'null').padEnd(12)} ${(co.domain ?? 'null').padEnd(25)} ${String(co.sample_size).padEnd(8)} ${String(co.matching_samples).padEnd(6)} ${co.apollo_credits_spent}`
      );
    }
  } else {
    console.log('  (no companies with samples yet)');
  }

  // Pull-sheet summary
  console.log('\nPull-Sheet Outcome:');
  console.log(`  Rows delivered: ${pullSheetRows.length}`);
  console.log(`  Archive size before: ${archiveSizeBefore}`);
  console.log(`  Archive growth: ${pullSheetRows.length} (approximate)`);

  // Icypeas sanity check from apollo_samples
  const { data: allSamples } = await supa
    .from('apollo_samples')
    .select('email_returned, email_ignored_reason, detected_pattern');
  if (allSamples) {
    const totalSamples = allSamples.length;
    const withEmail = allSamples.filter(s => s.email_returned).length;
    const withGoodEmail = allSamples.filter(s => !s.email_ignored_reason && s.email_returned).length;
    const pct = totalSamples > 0 ? ((withGoodEmail / totalSamples) * 100).toFixed(1) : '0';
    console.log(`\nIcypeas Sanity Check (apollo_samples):`);
    console.log(`  Total samples: ${totalSamples}`);
    console.log(`  With email returned: ${withEmail}`);
    console.log(`  With usable email (no ignore reason): ${withGoodEmail} (${pct}%)`);

    const patternCounts = new Map<string, number>();
    for (const s of allSamples) {
      if (s.detected_pattern) {
        patternCounts.set(s.detected_pattern, (patternCounts.get(s.detected_pattern) ?? 0) + 1);
      }
    }
    if (patternCounts.size > 0) {
      console.log('  Patterns seen:');
      for (const [p, n] of [...patternCounts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${p}: ${n}`);
      }
    }

    const ignoreCounts = new Map<string, number>();
    for (const s of allSamples) {
      if (s.email_ignored_reason) {
        ignoreCounts.set(s.email_ignored_reason, (ignoreCounts.get(s.email_ignored_reason) ?? 0) + 1);
      }
    }
    if (ignoreCounts.size > 0) {
      console.log('  Ignore reasons:');
      for (const [reason, n] of [...ignoreCounts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${reason}: ${n}`);
      }
    }
  }

  // Errors & warnings
  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  WARN: ${w}`);
  }

  if (failures.length > 0) {
    console.log(`\nFAILURES (${failures.length}):`);
    for (const f of failures) console.log(`  FAIL: ${f}`);
    console.log('\nExit code: 1');
    process.exit(1);
  } else {
    console.log('\nAll assertions passed.');
    console.log('Exit code: 0');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
